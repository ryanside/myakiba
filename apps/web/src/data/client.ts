import {
  experimental_streamedQuery as streamedQuery,
  infiniteQueryOptions,
  queryOptions,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type { keepPreviousData, QueryClient, UseMutationResult } from "@tanstack/react-query";
import { isTaggedError, Panic, Result } from "better-result";
import { useCallback } from "react";
import { toast } from "@/components/ui/toast";
import { asPanic } from "@/lib/as-panic";
import { WriteFailed } from "@/lib/errors/write-failed";
import { call } from "./api";
import type { EdenAnswer } from "./api";
import { inFamilies } from "./catalog";
import type { Family, PersistedFamily, RootOf } from "./catalog";

/** What a read's `error` can be: the failures its load declares, or a defect. */
export type ReadFailure<Failure> = Failure | Panic;

/**
 * Runs a load or a write for react-query, which reads a failure only from a throw. A failed
 * Result is thrown as its own error. Anything the load throws is a defect, a Panic that keeps
 * the thrown message, so a screen that shows `error.message` shows what it showed before.
 */
export async function settle<Value, Failure>(
  load: () => Promise<Result<Value, Failure>>,
): Promise<Value> {
  let result: Result<Value, Failure>;
  try {
    result = await load();
  } catch (error) {
    throw asPanic(error);
  }
  if (result.isErr()) throw result.error;
  return result.value;
}

type PageCursor = { readonly limit: number; readonly offset: number };
type OffsetPage = { readonly items: readonly unknown[]; readonly totalCount: number };

type InfiniteReadSpec<Input, Identity, Page extends OffsetPage> = {
  readonly pageSize: number;
  readonly failure: string;
  /** The part of the input that changes the result. It becomes the key. */
  readonly identify: (input: Input) => Identity;
  readonly request: (input: Input, cursor: PageCursor) => PromiseLike<EdenAnswer<Page>>;
};

export function infiniteRead<Input, Identity, Page extends OffsetPage>(
  spec: InfiniteReadSpec<Input, Identity, Page>,
): InfiniteReadSpec<Input, Identity, Page> {
  return spec;
}

export function offsetAfterLoaded(lastPage: OffsetPage, allPages: readonly OffsetPage[]) {
  const loadedCount = allPages.reduce((count, page) => count + page.items.length, 0);
  return loadedCount < lastPage.totalCount ? loadedCount : undefined;
}

function stampInfiniteRead<Input, Identity, Page extends OffsetPage>(
  family: PersistedFamily,
  view: string,
  spec: InfiniteReadSpec<Input, Identity, Page>,
) {
  const key = (identity: Identity) => ["resource", family, view, identity] as const;
  return {
    key,
    /** A filter that matches every key whose identity contains these fields. */
    partialKey: (identity: Partial<Identity>) => ["resource", family, view, identity] as const,
    options: (input: Input) =>
      infiniteQueryOptions({
        queryKey: key(spec.identify(input)),
        queryFn: ({ pageParam }): Promise<Page> =>
          settle(() =>
            call(spec.request(input, { limit: spec.pageSize, offset: pageParam }), {
              fallback: spec.failure,
            }),
          ),
        initialPageParam: 0,
        getNextPageParam: offsetAfterLoaded,
      }),
  };
}

type InfiniteRead<Input, Identity, Page extends OffsetPage> = ReturnType<
  typeof stampInfiniteRead<Input, Identity, Page>
>;

/** Each read's key is `["resource", family, <its entry name>, identity]`, so two reads never share a key. */
export function defineResource<
  const Reads extends Record<string, InfiniteReadSpec<never, unknown, OffsetPage>>,
>(
  family: PersistedFamily,
  reads: Reads,
): {
  readonly [View in keyof Reads]: Reads[View] extends InfiniteReadSpec<
    infer Input,
    infer Identity,
    infer Page
  >
    ? InfiniteRead<Input, Identity, Page>
    : never;
} {
  return Object.fromEntries(
    Object.entries(reads).map(([view, spec]) => [view, stampInfiniteRead(family, view, spec)]),
  ) as never;
}

export function useInfiniteRead<Input, Identity, Page extends OffsetPage>(
  read: InfiniteRead<Input, Identity, Page>,
  input: Input,
) {
  return useInfiniteQuery(read.options(input));
}

type ReadCache = {
  readonly placeholderData?: typeof keepPreviousData;
  readonly staleTime?: number;
  readonly retry?: false;
  readonly refetchOnWindowFocus?: true;
  readonly refetchInterval?: number;
  readonly refetchIntervalInBackground?: false;
};

type RootedReadSpec<F extends Family, Input, Data, Failure> = ReadCache & {
  /** A hand-built key under one of the family's cataloged roots, so sync and the family's writes refresh it. */
  readonly key: (input: Input) => readonly [RootOf<F>, ...unknown[]];
  /** Its failure is what the screen sees as `error`. */
  readonly load: (input: Input) => Promise<Result<Data, Failure>>;
  /** Shows the previous input's data while this input loads, when it still applies. */
  readonly keepPrevious?: (previousData: Data, input: Input) => boolean;
};

export function rootedRead<F extends Family, Input, Data, Failure>(
  family: F,
  { key, load, keepPrevious, placeholderData, ...cache }: RootedReadSpec<F, Input, Data, Failure>,
) {
  return {
    family,
    key,
    options: (input: Input) =>
      queryOptions<Data, ReadFailure<Failure>, Data, ReturnType<typeof key>>({
        ...cache,
        placeholderData: keepPrevious
          ? (previousData) =>
              previousData !== undefined && keepPrevious(previousData, input)
                ? previousData
                : undefined
          : placeholderData,
        queryKey: key(input),
        queryFn: () => settle(() => load(input)),
      }),
  };
}

type RootedRead<F extends Family, Input, Data, Failure> = ReturnType<
  typeof rootedRead<F, Input, Data, Failure>
>;

type StreamedReadSpec<F extends Family, Input, Chunk, Data, Failure> = {
  readonly key: (input: Input) => readonly [RootOf<F>, ...unknown[]];
  /**
   * Opens the stream. `client` is the cache the read lives in, for what a chunk refreshes.
   * A failure while reading the stream is thrown from it, because streamedQuery reads only throws.
   */
  readonly open: (
    input: Input,
    context: { readonly signal: AbortSignal; readonly client: QueryClient },
  ) => Promise<Result<AsyncIterable<Chunk>, Failure>>;
  readonly initialValue: (input: Input) => Data;
  readonly reducer: (data: Data, chunk: Chunk) => Data;
  /** Keeps the data a refetch reconnects from, instead of starting over. */
  readonly refetchMode?: "append";
  readonly retry: false | ((failureCount: number, error: ReadFailure<Failure>) => boolean);
};

/** A read that follows a server stream. Focusing the window never reopens it. */
export function streamedRead<F extends Family, Input, Chunk, Data, Failure>(
  family: F,
  {
    key,
    open,
    initialValue,
    reducer,
    refetchMode,
    retry,
  }: StreamedReadSpec<F, Input, Chunk, Data, Failure>,
) {
  return {
    family,
    key,
    options: (input: Input) =>
      queryOptions<Data, ReadFailure<Failure>, Data, ReturnType<typeof key>>({
        queryKey: key(input),
        queryFn: streamedQuery({
          streamFn: ({ signal, client }) => settle(() => open(input, { signal, client })),
          reducer,
          initialValue: initialValue(input),
          refetchMode,
        }),
        refetchOnWindowFocus: false,
        retry,
      }),
  };
}

type StreamedRead<F extends Family, Input, Chunk, Data, Failure> = ReturnType<
  typeof streamedRead<F, Input, Chunk, Data, Failure>
>;

type ReadSwitch = { readonly enabled?: boolean };

type ReadArgs<Input> = undefined extends Input
  ? [input?: Input, readSwitch?: ReadSwitch]
  : [input: Input, readSwitch?: ReadSwitch];

/** `error` is the read's declared failure or a defect, and its `message` is the text to show. */
export function useRead<F extends Family, Input, Data, Failure, Chunk = never>(
  read: RootedRead<F, Input, Data, Failure> | StreamedRead<F, Input, Chunk, Data, Failure>,
  ...[input, readSwitch]: ReadArgs<Input>
) {
  const enabled = readSwitch?.enabled;
  return useQuery({ ...read.options(input as Input), ...(enabled !== undefined && { enabled }) });
}

type RootedInfiniteReadSpec<F extends Family, Input, Page, Failure> = {
  readonly key: (input: Input) => readonly [RootOf<F>, ...unknown[]];
  readonly loadPage: (input: Input, offset: number) => Promise<Result<Page, Failure>>;
  readonly nextOffset: (
    lastPage: Page,
    allPages: readonly Page[],
    lastOffset: number,
  ) => number | undefined;
  readonly staleTime?: number;
  readonly retry?: false;
};

export function rootedInfiniteRead<F extends Family, Input, Page, Failure>(
  family: F,
  { key, loadPage, nextOffset, ...cache }: RootedInfiniteReadSpec<F, Input, Page, Failure>,
) {
  return {
    family,
    key,
    options: (input: Input) =>
      infiniteQueryOptions({
        ...cache,
        queryKey: key(input),
        queryFn: ({ pageParam }): Promise<Page> => settle(() => loadPage(input, pageParam)),
        initialPageParam: 0,
        getNextPageParam: nextOffset,
      }),
  };
}

type RootedInfiniteRead<F extends Family, Input, Page, Failure> = ReturnType<
  typeof rootedInfiniteRead<F, Input, Page, Failure>
>;

export function useRootedInfiniteRead<F extends Family, Input, Page, Failure>(
  read: RootedInfiniteRead<F, Input, Page, Failure>,
  ...[input, readSwitch]: ReadArgs<Input>
) {
  const enabled = readSwitch?.enabled;
  return useInfiniteQuery({
    ...read.options(input as Input),
    ...(enabled !== undefined && { enabled }),
  });
}

/** Refetches one read's query the way an invalidation does, for a retry button. */
export function useInvalidateRead<F extends Family, Input, Data, Failure>(
  read: RootedRead<F, Input, Data, Failure>,
) {
  const queryClient = useQueryClient();
  return useCallback(
    (input: Input) => queryClient.invalidateQueries({ queryKey: read.key(input) }),
    [queryClient, read],
  );
}

/** Loads one read's query before it shows, like a row about to expand. It never rejects. */
export function usePrefetchRead<F extends Family, Input, Data, Failure>(
  read: RootedRead<F, Input, Data, Failure>,
) {
  const queryClient = useQueryClient();
  return useCallback(
    (input: Input) => queryClient.prefetchQuery(read.options(input)),
    [queryClient, read],
  );
}

/** Refetches every query of these families, the way a write's refetch does. */
export function invalidateFamilies(
  queryClient: QueryClient,
  families: readonly Family[],
): Promise<void> {
  return queryClient.invalidateQueries({
    predicate: (query) => inFamilies(query.queryKey, families),
  });
}

type Rollback = () => void;

/** What a failure toast says under its title for a defect, whose own message is never shown. */
const DEFECT_DESCRIPTION = "Something went wrong. Reload the page and try again";

/** The text under a failure toast that a screen words itself: the declared failure's message, or the safe text for a defect. */
export function failureText(failure: ReadFailure<Error>): string {
  return Panic.is(failure) ? DEFECT_DESCRIPTION : failure.message;
}

type FailureToast = { readonly title: string; readonly description?: string };

/** A command's failure toast. Only a declared failure reaches the command's wording of it. */
function failureToast<Input, Failure>(
  title: string,
  {
    declaredFailureTitle,
    failureDescription,
  }: Pick<
    CommandSpec<Input, unknown, Failure, PersistedFamily>,
    "declaredFailureTitle" | "failureDescription"
  >,
  input: Input,
  failure: ReadFailure<Failure>,
): FailureToast {
  if (Panic.is(failure)) return { title, description: DEFECT_DESCRIPTION };
  const description = failureDescription?.(input, failure);
  return {
    title: declaredFailureTitle?.(input, failure) ?? title,
    ...(description !== undefined && { description }),
  };
}

type RefetchKey<F extends PersistedFamily> = {
  readonly queryKey: readonly [RootOf<F>, ...unknown[]];
  readonly exact?: true;
};

type RefetchTiming =
  | {
      readonly refetchAfterFailure?: true;
      readonly refetchBy?: never;
    }
  | {
      /** The caller refetches once with `refetch`, like a queue that settles several writes. */
      readonly refetchBy: "caller";
      readonly refetchAfterFailure?: never;
    };

type CommandSpec<Input, Output, Failure, F extends PersistedFamily> = RefetchTiming & {
  /** Families this write can change. `run` resolves after they refetch. */
  readonly invalidates: readonly [F, ...F[]];
  /** Narrows the refetch to these keys of the invalidated families. */
  readonly refetchKeys?: (input: Input) => readonly RefetchKey<F>[];
  /** Keys to refetch when the write fails, such as a status that says why. */
  readonly failureRefetchKeys?: (input: Input) => readonly RefetchKey<F>[];
  /** The write. Its failure is the command's declared failure, and a throw is a defect. */
  readonly persist: (input: Input) => Promise<Result<Output, Failure>>;
  /** Patches the cache before the write and returns what puts it back if the write fails. A throw is a defect. */
  readonly optimistic?: (queryClient: QueryClient, input: Input) => Promise<Rollback | undefined>;
  /** A success toast's title, or no toast when it returns undefined. */
  readonly successTitle?: (input: Input, output: Output) => string | undefined;
  /** A failure toast's title. It never sees the failure, so a defect shows it too. A command without one shows no failure toast. */
  readonly failureTitle?: (input: Input) => string;
  /** The title for a declared failure, in place of `failureTitle` unless it returns undefined. */
  readonly declaredFailureTitle?: (input: Input, failure: Failure) => string | undefined;
  /** The text under the title for a declared failure. A defect always shows `DEFECT_DESCRIPTION` instead. */
  readonly failureDescription?: (input: Input, failure: Failure) => string;
  /** Cache patches that run after the write and before the refetch. */
  readonly saved?: (queryClient: QueryClient, input: Input, output: Output) => Promise<void>;
};

const commandSpec = Symbol("commandSpec");

/** Screens cannot reach `persist`, so every write goes through `useResourceMutation`. */
type Command<Input, Output, Failure> = {
  readonly [commandSpec]: CommandSpec<Input, Output, Failure, PersistedFamily>;
};

export function defineCommand<Input, Output, Failure, const F extends PersistedFamily>(
  spec: CommandSpec<Input, Output, Failure, F>,
): Command<Input, Output, Failure> {
  return { [commandSpec]: spec as CommandSpec<Input, Output, Failure, PersistedFamily> };
}

/** What every write resolves with. A write never rejects. */
type Saved<Output> = Result<Output, WriteFailed>;

/** What a write handler returns, such as a form's `onSubmit` prop. */
export type Saving<Output = unknown> = Promise<Saved<Output>>;

/** Runs a callback the runner hands react-query. Whatever it throws is a defect. */
export async function guard<Value>(step: () => Value | Promise<Value>): Promise<Value> {
  try {
    return await step();
  } catch (error) {
    throw asPanic(error);
  }
}

/**
 * The one caller of `mutateAsync`, so a write's `run` never rejects: a failure resolves as
 * WriteFailed. The write's own callbacks have already told the user, so a defect is only
 * reported here, once.
 */
export function useWrite<Input, Output, Failure>(
  mutation: UseMutationResult<Output, ReadFailure<Failure>, Input, unknown>,
) {
  const { mutateAsync } = mutation;
  const run = (input: Input): Saving<Output> =>
    Result.tryPromise({
      try: () => mutateAsync(input),
      catch: (thrown) => {
        const cause = !Panic.is(thrown) && isTaggedError(thrown) ? thrown : asPanic(thrown);
        if (Panic.is(cause)) console.error(cause);
        return new WriteFailed({ cause, message: cause.message });
      },
    });
  return {
    run,
    isPending: mutation.isPending,
    isSuccess: mutation.isSuccess,
    error: mutation.error,
    reset: mutation.reset,
    pendingInput: mutation.isPending ? mutation.variables : undefined,
  } as const;
}

type Feedback<Input, Output> = {
  /** Feedback that needs the screen, like a toast whose action navigates. Runs where `successTitle` does. */
  readonly onSaved?: (input: Input, output: Output) => void;
};

/** `run` never rejects. It resolves after the write and every declared refetch finish. */
export function useResourceMutation<Input, Output, Failure>(
  command: Command<Input, Output, Failure>,
  { onSaved }: Feedback<Input, Output> = {},
) {
  const spec = command[commandSpec];
  const { optimistic, refetchAfterFailure, refetchBy } = spec;
  const queryClient = useQueryClient();
  const refetchFamilies = () => invalidateFamilies(queryClient, spec.invalidates);
  const invalidateKeys = (keys: readonly RefetchKey<PersistedFamily>[]) =>
    Promise.all(keys.map((filter) => queryClient.invalidateQueries(filter)));
  const refetch = async (input: Input) => {
    const keys = spec.refetchKeys?.(input);
    if (keys === undefined) await refetchFamilies();
    else await invalidateKeys(keys);
  };
  const mutation = useMutation<Output, ReadFailure<Failure>, Input, Rollback | undefined>({
    mutationFn: (input) => settle(() => spec.persist(input)),
    onMutate: optimistic && ((input) => guard(() => optimistic(queryClient, input))),
    onSuccess: (output, input) =>
      guard(async () => {
        const successTitle = spec.successTitle?.(input, output);
        if (successTitle !== undefined) toast.add({ type: "success", title: successTitle });
        onSaved?.(input, output);
        await spec.saved?.(queryClient, input, output);
        if (!refetchAfterFailure && !refetchBy) await refetch(input);
      }),
    onError: (failure, input, rollback) =>
      guard(async () => {
        rollback?.();
        if (spec.failureTitle) {
          const title = spec.failureTitle(input);
          toast.add({ type: "error", ...failureToast(title, spec, input, failure) });
        }
        await invalidateKeys(spec.failureRefetchKeys?.(input) ?? []);
      }),
    onSettled: refetchAfterFailure && ((_output, _failure, input) => guard(() => refetch(input))),
  });

  return {
    ...useWrite(mutation),
    /** Only for a `refetchBy: "caller"` command, after its writes settle. */
    refetch: refetchFamilies,
  } as const;
}
