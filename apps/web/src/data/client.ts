import {
  experimental_streamedQuery as streamedQuery,
  infiniteQueryOptions,
  queryOptions,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type { keepPreviousData, QueryClient } from "@tanstack/react-query";
import { isTaggedError, Panic, Result } from "better-result";
import { useCallback } from "react";
import { toast } from "@/components/ui/toast";
import { asPanic } from "@/lib/as-panic";
import { WriteFailed } from "@/lib/errors/write-failed";
import { call } from "./api";
import type { EdenAnswer } from "./api";
import { inFamilies } from "./catalog";
import type { Family, PersistedFamily, RootOf, WritableFamily } from "./catalog";

/** What a read's `error` can be: the failures its load declares, or a defect. */
type ReadFailure<Failure> = Failure | Panic;

/**
 * Runs a load for react-query, which reads a failure only from a throw. A failed
 * Result is thrown as its own error. Anything the load throws is a defect, a Panic that keeps
 * the thrown message for the log. A screen shows either through `failureText`.
 */
async function settle<Value, Failure>(load: () => Promise<Result<Value, Failure>>): Promise<Value> {
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

function stampInfiniteRead<F extends PersistedFamily, Input, Identity, Page extends OffsetPage>(
  family: F,
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

type InfiniteRead<
  Input,
  Identity,
  Page extends OffsetPage,
  F extends PersistedFamily = PersistedFamily,
> = ReturnType<typeof stampInfiniteRead<F, Input, Identity, Page>>;

/** Each read's key is `["resource", family, <its entry name>, identity]`, so two reads never share a key. */
export function defineResource<
  const F extends PersistedFamily,
  const Reads extends Record<string, InfiniteReadSpec<never, unknown, OffsetPage>>,
>(
  family: F,
  reads: Reads,
): {
  readonly [View in keyof Reads]: Reads[View] extends InfiniteReadSpec<
    infer Input,
    infer Identity,
    infer Page
  >
    ? InfiniteRead<Input, Identity, Page, F>
    : never;
} {
  return Object.fromEntries(
    Object.entries(reads).map(([view, spec]) => [view, stampInfiniteRead(family, view, spec)]),
  ) as never;
}

export function useInfiniteRead<
  F extends PersistedFamily,
  Input,
  Identity,
  Page extends OffsetPage,
>(read: InfiniteRead<Input, Identity, Page, F>, input: Input) {
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
    (...[input]: undefined extends Input ? [input?: Input] : [input: Input]) =>
      queryClient.invalidateQueries({ queryKey: read.key(input as Input) }),
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

/** What a screen shows for a defect, whose own message is never shown. */
const DEFECT_DESCRIPTION = "Something went wrong. Reload the page and try again";

/**
 * The text a screen shows for a read's or a write's failure: a declared failure's message, or
 * the safe text for a defect. Only a tagged error other than a Panic is declared, so anything
 * else react-query caught is a defect too.
 */
export function failureText(failure: Error): string {
  return Panic.is(failure) || !isTaggedError(failure) ? DEFECT_DESCRIPTION : failure.message;
}

export type FailureToast = { readonly title: string; readonly description?: string };

/** A failure toast titled `title` that shows a declared failure's message as its title or under it. */
export function messageAs<Input>(place: "title" | "description", title: (input: Input) => string) {
  return (input: Input, failure: Error | null): FailureToast => {
    if (failure === null) return { title: title(input) };
    if (place === "title") return { title: failure.message };
    return { title: title(input), description: failure.message };
  };
}

export type RefetchKey<F extends WritableFamily> = {
  readonly queryKey: readonly [RootOf<F>, ...unknown[]] | readonly ["resource", F, ...unknown[]];
  readonly exact?: true;
  /** Marks the queries stale without refetching them. */
  readonly refetchType?: "none";
};

type RefetchTiming<Input, Output, F extends WritableFamily> =
  | {
      /**
       * Narrows the refetch after a save to these keys of the invalidated families. When it
       * returns undefined, every invalidated family refetches.
       */
      readonly refetchKeys?: (input: Input, output: Output) => readonly RefetchKey<F>[] | undefined;
      /** `"background"` starts the refetch after a save and lets `run` resolve without it. */
      readonly refetchBy?: "background";
      readonly refetchAfterFailure?: never;
    }
  | {
      /** Every invalidated family refetches after a failure too. */
      readonly refetchAfterFailure: true;
      readonly refetchKeys?: never;
      readonly refetchBy?: never;
    }
  | {
      /** The caller refetches once with `refetch`, like a queue that settles several writes. */
      readonly refetchBy: "caller";
      readonly refetchKeys?: never;
      readonly refetchAfterFailure?: never;
    };

type CommandSpec<Input, Output, Failure extends Error, F extends WritableFamily> = RefetchTiming<
  Input,
  Output,
  F
> & {
  /** Families this write can change, or `"nothing"` for one that changes no cached data. */
  readonly invalidates: readonly [F, ...F[]] | "nothing";
  /** Keys to refetch when the write fails, such as a status that says why. */
  readonly failureRefetchKeys?: (input: Input) => readonly RefetchKey<F>[];
  /** The write. Its failure is the command's declared failure, and a throw is a defect. */
  readonly persist: (input: Input) => Promise<Result<Output, Failure>>;
  /**
   * Patches the cache before the write and returns what puts it back if the write fails, or null
   * when it patched nothing. Its failure stops the write as a declared failure, and a throw is a
   * defect.
   */
  readonly optimistic?: (
    queryClient: QueryClient,
    input: Input,
  ) => Promise<Result<Rollback | null, Failure>>;
  /** A success toast's title, or no toast when it returns undefined. */
  readonly successTitle?: (input: Input, output: Output) => string | undefined;
  readonly successDescription?: (input: Input) => string;
  /**
   * The failure toast for a declared failure, or for a defect when `failure` is null. A defect
   * always shows the safe text under its title. A command without one shows no failure toast.
   */
  readonly failureToast?: (input: Input, failure: Failure | null) => FailureToast;
  /** Cache patches that run after the write and before the refetch. */
  readonly saved?: (queryClient: QueryClient, input: Input, output: Output) => Promise<void>;
  /** Runs last, once the write saved or failed. */
  readonly settled?: (queryClient: QueryClient, input: Input) => void;
};

const commandSpec = Symbol("commandSpec");

/** Screens cannot reach `persist`, so every write goes through `useResourceMutation`. */
export type Command<Input, Output, Failure extends Error> = {
  readonly [commandSpec]: CommandSpec<Input, Output, Failure, WritableFamily>;
};

export function defineCommand<Input, Output, Failure extends Error, const F extends WritableFamily>(
  spec: CommandSpec<Input, Output, Failure, F>,
): Command<Input, Output, Failure> {
  return { [commandSpec]: spec as CommandSpec<Input, Output, Failure, WritableFamily> };
}

/** What every write resolves with. A write never rejects. */
type Saved<Output> = Result<Output, WriteFailed>;

/** What a write handler returns, such as a form's `onSubmit` prop. */
export type Saving<Output = unknown> = Promise<Saved<Output>>;

type WriteOptions<Input, Output> = {
  /** Feedback that needs the screen, like a toast whose action navigates. The write waits for it. */
  readonly onSaved?: (input: Input, output: Output) => void | Promise<void>;
  /** Shows the command's failure toast in place of the runner, such as with an action. */
  readonly onFailed?: (input: Input, failureToast: FailureToast) => void;
  /** Writes that share a key count as one save in progress for `useIsMutating`. */
  readonly mutationKey?: readonly unknown[];
};

/** Runs one step of a write. Whatever it throws is a defect. */
async function attempt<Value, Failure>(
  step: () => Promise<Result<Value, Failure>>,
): Promise<Result<Value, Failure | Panic>> {
  try {
    return await step();
  } catch (error) {
    return Result.err(asPanic(error));
  }
}

function familiesOf(spec: {
  readonly invalidates: readonly Family[] | "nothing";
}): readonly Family[] {
  return spec.invalidates === "nothing" ? [] : spec.invalidates;
}

/**
 * One write from start to end: the optimistic patch, the write, then the success feedback and
 * refetch, or the rollback, failure toast and failure refetch. A throw in a success step fails
 * the write like a defect in the write itself, and a throw while failing replaces the failure.
 */
async function runCommand<Input, Output, Failure extends Error>(
  spec: CommandSpec<Input, Output, Failure, WritableFamily>,
  queryClient: QueryClient,
  input: Input,
  { onSaved, onFailed }: WriteOptions<Input, Output>,
): Promise<Result<Output, Failure | Panic>> {
  const refetchFamilies = () => invalidateFamilies(queryClient, familiesOf(spec));
  const invalidateKeys = (keys: readonly RefetchKey<WritableFamily>[]) =>
    Promise.all(keys.map((filter) => queryClient.invalidateQueries(filter)));
  const refetchSaved = async (output: Output) => {
    const keys = spec.refetchKeys?.(input, output);
    if (keys === undefined) await refetchFamilies();
    else await invalidateKeys(keys);
  };

  const patched = await attempt(async () =>
    spec.optimistic ? spec.optimistic(queryClient, input) : Result.ok(null),
  );
  const rollback = patched.isOk() ? patched.value : null;
  const written = await attempt(async (): Promise<Result<Output, Failure | Panic>> => {
    if (patched.isErr()) return Result.err(patched.error);
    const saved = await spec.persist(input);
    if (saved.isErr()) return saved;
    const output = saved.value;
    const successTitle = spec.successTitle?.(input, output);
    if (successTitle !== undefined)
      toast.add({
        type: "success",
        title: successTitle,
        ...(spec.successDescription && { description: spec.successDescription(input) }),
      });
    await onSaved?.(input, output);
    await spec.saved?.(queryClient, input, output);
    if (spec.refetchBy === "background") void refetchSaved(output);
    else if (!spec.refetchAfterFailure && !spec.refetchBy) await refetchSaved(output);
    return saved;
  });

  if (written.isErr()) {
    const failure = written.error;
    rollback?.();
    if (spec.failureToast) {
      const declared = Panic.is(failure) ? null : failure;
      const shown = {
        ...spec.failureToast(input, declared),
        ...(declared === null && { description: DEFECT_DESCRIPTION }),
      };
      if (onFailed) onFailed(input, shown);
      else toast.add({ type: "error", ...shown });
    }
    await invalidateKeys(spec.failureRefetchKeys?.(input) ?? []);
  }
  if (spec.refetchAfterFailure) await refetchFamilies();
  spec.settled?.(queryClient, input);
  return written;
}

/**
 * `run` never rejects. It resolves after the write and every refetch it waits for, and a failure
 * resolves as WriteFailed once the write has told the user. A defect is reported here, once.
 * react-query holds only whether a write is in flight, its input and its last Result.
 */
export function useResourceMutation<Input, Output, Failure extends Error>(
  command: Command<Input, Output, Failure>,
  options: WriteOptions<Input, Output> = {},
) {
  const spec = command[commandSpec];
  const queryClient = useQueryClient();
  const mutation = useMutation({
    ...(options.mutationKey && { mutationKey: options.mutationKey }),
    mutationFn: async (input: Input): Saving<Output> => {
      const settled = await attempt(() => runCommand(spec, queryClient, input, options));
      return settled.mapError((cause) => {
        if (Panic.is(cause)) console.error(cause);
        return new WriteFailed({ cause, message: cause.message });
      });
    },
  });

  return {
    run: (...[input]: undefined extends Input ? [input?: Input] : [input: Input]): Saving<Output> =>
      mutation.mutateAsync(input as Input),
    isPending: mutation.isPending,
    /** The last write's Result, until the next write starts or `reset` clears it. */
    last: mutation.data,
    reset: mutation.reset,
    pendingInput: mutation.isPending ? mutation.variables : undefined,
    /** Only for a `refetchBy: "caller"` command, after its writes settle. */
    refetch: () => invalidateFamilies(queryClient, familiesOf(spec)),
  } as const;
}
