import {
  infiniteQueryOptions,
  queryOptions,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type { keepPreviousData, QueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { toast } from "@/components/ui/toast";
import { getErrorMessage } from "@/lib/treaty-client";
import { inFamilies } from "./catalog";
import type { Family, PersistedFamily, RootOf } from "./catalog";

type EdenResult<Data> =
  | { readonly data: Data; readonly error: null }
  | { readonly data: null; readonly error: Parameters<typeof getErrorMessage>[0] };

/** The one place an Eden response becomes data or a thrown Error. */
export async function unwrap<Data>(
  response: PromiseLike<EdenResult<Data>>,
  fallback: string,
): Promise<Data> {
  const { data, error } = await response;
  if (error) throw new Error(getErrorMessage(error, fallback));
  return data;
}

type PageCursor = { readonly limit: number; readonly offset: number };
type OffsetPage = { readonly items: readonly unknown[]; readonly totalCount: number };

type InfiniteReadSpec<Input, Identity, Page extends OffsetPage> = {
  readonly pageSize: number;
  readonly failure: string;
  /** The part of the input that changes the result. It becomes the key. */
  readonly identify: (input: Input) => Identity;
  readonly request: (input: Input, cursor: PageCursor) => PromiseLike<EdenResult<Page>>;
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
        queryFn: ({ pageParam }) =>
          unwrap(spec.request(input, { limit: spec.pageSize, offset: pageParam }), spec.failure),
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

type RootedReadSpec<F extends Family, Input, Data> = ReadCache & {
  /**
   * A hand-built key under one of the family's cataloged roots, so sync and the family's
   * writes refresh it. Scraper code still invalidates these keys by their literal roots.
   */
  readonly key: (input: Input) => readonly [RootOf<F>, ...unknown[]];
  readonly load: (input: Input) => Promise<Data>;
  /** Shows the previous input's data while this input loads, when it still applies. */
  readonly keepPrevious?: (previousData: Data, input: Input) => boolean;
};

export function rootedRead<F extends Family, Input, Data>(
  family: F,
  { key, load, keepPrevious, placeholderData, ...cache }: RootedReadSpec<F, Input, Data>,
) {
  return {
    family,
    key,
    options: (input: Input) =>
      queryOptions({
        ...cache,
        placeholderData: keepPrevious
          ? (previousData) =>
              previousData !== undefined && keepPrevious(previousData, input)
                ? previousData
                : undefined
          : placeholderData,
        queryKey: key(input),
        queryFn: () => load(input),
      }),
  };
}

type RootedRead<F extends Family, Input, Data> = ReturnType<typeof rootedRead<F, Input, Data>>;

type ReadSwitch = { readonly enabled?: boolean };

type ReadArgs<Input> = undefined extends Input
  ? [input?: Input, readSwitch?: ReadSwitch]
  : [input: Input, readSwitch?: ReadSwitch];

export function useRead<F extends Family, Input, Data>(
  read: RootedRead<F, Input, Data>,
  ...[input, readSwitch]: ReadArgs<Input>
) {
  const enabled = readSwitch?.enabled;
  return useQuery({ ...read.options(input as Input), ...(enabled !== undefined && { enabled }) });
}

type RootedInfiniteReadSpec<F extends Family, Input, Page> = {
  readonly key: (input: Input) => readonly [RootOf<F>, ...unknown[]];
  readonly loadPage: (input: Input, offset: number) => Promise<Page>;
  readonly nextOffset: (
    lastPage: Page,
    allPages: readonly Page[],
    lastOffset: number,
  ) => number | undefined;
  readonly staleTime?: number;
  readonly retry?: false;
};

export function rootedInfiniteRead<F extends Family, Input, Page>(
  family: F,
  { key, loadPage, nextOffset, ...cache }: RootedInfiniteReadSpec<F, Input, Page>,
) {
  return {
    family,
    key,
    options: (input: Input) =>
      infiniteQueryOptions({
        ...cache,
        queryKey: key(input),
        queryFn: ({ pageParam }) => loadPage(input, pageParam),
        initialPageParam: 0,
        getNextPageParam: nextOffset,
      }),
  };
}

type RootedInfiniteRead<F extends Family, Input, Page> = ReturnType<
  typeof rootedInfiniteRead<F, Input, Page>
>;

export function useRootedInfiniteRead<F extends Family, Input, Page>(
  read: RootedInfiniteRead<F, Input, Page>,
  ...[input, readSwitch]: ReadArgs<Input>
) {
  const enabled = readSwitch?.enabled;
  return useInfiniteQuery({
    ...read.options(input as Input),
    ...(enabled !== undefined && { enabled }),
  });
}

/** Refetches one read's query the way an invalidation does, for a retry button. */
export function useInvalidateRead<F extends Family, Input, Data>(read: RootedRead<F, Input, Data>) {
  const queryClient = useQueryClient();
  return useCallback(
    (input: Input) => queryClient.invalidateQueries({ queryKey: read.key(input) }),
    [queryClient, read],
  );
}

type Rollback = () => void;

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

type CommandSpec<Input, Output, F extends PersistedFamily> = RefetchTiming & {
  /** Families this write can change. `run` resolves after they refetch. */
  readonly invalidates: readonly [F, ...F[]];
  /** Narrows the refetch to these keys of the invalidated families. */
  readonly refetchKeys?: (input: Input) => readonly RefetchKey<F>[];
  readonly persist: (input: Input) => Promise<Output>;
  /** Patches the cache before the write and returns what puts it back if the write fails. */
  readonly optimistic?: (queryClient: QueryClient, input: Input) => Promise<Rollback | undefined>;
  /** A success toast's title, or no toast when it returns undefined. */
  readonly successTitle?: (input: Input) => string | undefined;
  /** A failure toast's title. A command without one shows no failure toast. */
  readonly failureTitle?: (input: Input, error: Error) => string;
  readonly failureDescription?: (input: Input, error: Error) => string;
  /** Cache patches that run after the write and before the refetch. */
  readonly saved?: (queryClient: QueryClient, input: Input, output: Output) => Promise<void>;
};

const commandSpec = Symbol("commandSpec");

/** Screens cannot reach `persist`, so every write goes through `useResourceMutation`. */
type Command<Input, Output> = {
  readonly [commandSpec]: CommandSpec<Input, Output, PersistedFamily>;
};

export function defineCommand<Input, Output, const F extends PersistedFamily>(
  spec: CommandSpec<Input, Output, F>,
): Command<Input, Output> {
  return { [commandSpec]: spec as CommandSpec<Input, Output, PersistedFamily> };
}

type SaveResult<Output> =
  | { readonly kind: "saved"; readonly value: Output }
  | { readonly kind: "failed"; readonly error: unknown };

type Feedback<Input, Output> = {
  /** Feedback that needs the screen, like a toast whose action navigates. Runs where `successTitle` does. */
  readonly onSaved?: (input: Input, output: Output) => void;
};

/** `run` never rejects. It resolves after the write and every declared refetch finish. */
export function useResourceMutation<Input, Output>(
  command: Command<Input, Output>,
  { onSaved }: Feedback<Input, Output> = {},
) {
  const spec = command[commandSpec];
  const { optimistic, refetchAfterFailure, refetchBy } = spec;
  const queryClient = useQueryClient();
  const refetchFamilies = () =>
    queryClient.invalidateQueries({
      predicate: (query) => inFamilies(query.queryKey, spec.invalidates),
    });
  const refetch = async (input: Input) => {
    const keys = spec.refetchKeys?.(input);
    if (keys === undefined) await refetchFamilies();
    else await Promise.all(keys.map((filter) => queryClient.invalidateQueries(filter)));
  };
  const mutation = useMutation<Output, Error, Input, Rollback | undefined>({
    mutationFn: spec.persist,
    onMutate: optimistic && ((input) => optimistic(queryClient, input)),
    onSuccess: async (output, input) => {
      const successTitle = spec.successTitle?.(input);
      if (successTitle !== undefined) toast.add({ type: "success", title: successTitle });
      onSaved?.(input, output);
      await spec.saved?.(queryClient, input, output);
      if (!refetchAfterFailure && !refetchBy) await refetch(input);
    },
    onError: (error, input, rollback) => {
      rollback?.();
      if (spec.failureTitle)
        toast.add({
          type: "error",
          title: spec.failureTitle(input, error),
          ...(spec.failureDescription && { description: spec.failureDescription(input, error) }),
        });
    },
    onSettled: refetchAfterFailure && ((_output, _error, input) => refetch(input)),
  });
  const { mutateAsync } = mutation;

  const run = async (input: Input): Promise<SaveResult<Output>> => {
    try {
      return { kind: "saved", value: await mutateAsync(input) };
    } catch (error) {
      return { kind: "failed", error };
    }
  };

  return {
    run,
    /** Only for a `refetchBy: "caller"` command, after its writes settle. */
    refetch: refetchFamilies,
    isPending: mutation.isPending,
    isSuccess: mutation.isSuccess,
    error: mutation.error,
    reset: mutation.reset,
    pendingInput: mutation.isPending ? mutation.variables : undefined,
  } as const;
}

/** For a caller that must see a failed write, like a form that stays open: rejects with its error. */
export async function orThrow<Output>(saving: Promise<SaveResult<Output>>): Promise<Output> {
  const result = await saving;
  if (result.kind === "failed") throw result.error;
  return result.value;
}
