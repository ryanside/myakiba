import {
  infiniteQueryOptions,
  queryOptions,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type { keepPreviousData, QueryClient } from "@tanstack/react-query";
import { toast } from "@/components/ui/toast";
import { getErrorMessage } from "@/lib/treaty-client";
import { inFamilies } from "./catalog";
import type { Families, PersistedFamily, RootOf } from "./catalog";

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
        getNextPageParam: (lastPage, allPages) => {
          const loadedCount = allPages.reduce((count, page) => count + page.items.length, 0);
          return loadedCount < lastPage.totalCount ? loadedCount : undefined;
        },
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

type RootedReadSpec<F extends PersistedFamily, Input, Data> = {
  /**
   * A hand-built key under one of the family's cataloged roots, so sync and the family's
   * writes refresh it. Scraper code still invalidates these keys by their literal roots.
   */
  readonly key: (input: Input) => readonly [RootOf<F>, ...unknown[]];
  readonly load: (input: Input) => Promise<Data>;
  readonly placeholderData?: typeof keepPreviousData;
  readonly staleTime?: number;
  readonly retry?: false;
};

export function rootedRead<F extends PersistedFamily, Input, Data>(
  family: F,
  { key, load, ...cache }: RootedReadSpec<F, Input, Data>,
) {
  return {
    family,
    key,
    options: (input: Input) =>
      queryOptions({ ...cache, queryKey: key(input), queryFn: () => load(input) }),
  };
}

type RootedRead<F extends PersistedFamily, Input, Data> = ReturnType<
  typeof rootedRead<F, Input, Data>
>;

export function useRead<F extends PersistedFamily, Input, Data>(
  read: RootedRead<F, Input, Data>,
  input: Input,
  { enabled }: { readonly enabled?: boolean } = {},
) {
  return useQuery({ ...read.options(input), ...(enabled !== undefined && { enabled }) });
}

type Rollback = () => void;

type CommandSpec<Input, Output> = {
  /** Families this write can change. `run` resolves after they refetch. */
  readonly invalidates: Families;
  readonly refetchAfterFailure?: true;
  readonly persist: (input: Input) => Promise<Output>;
  /** Patches the cache before the write and returns what puts it back if the write fails. */
  readonly optimistic?: (queryClient: QueryClient, input: Input) => Promise<Rollback | undefined>;
  readonly successTitle?: (input: Input) => string;
  readonly failureTitle: (input: Input) => string;
  /** Cache patches that run after the write and before the refetch. */
  readonly saved?: (queryClient: QueryClient, input: Input, output: Output) => Promise<void>;
};

const commandSpec = Symbol("commandSpec");

/** Screens cannot reach `persist`, so every write goes through `useResourceMutation`. */
type Command<Input, Output> = {
  readonly [commandSpec]: CommandSpec<Input, Output>;
};

export function defineCommand<Input, Output>(
  spec: CommandSpec<Input, Output>,
): Command<Input, Output> {
  return { [commandSpec]: spec };
}

type SaveResult<Output> =
  | { readonly kind: "saved"; readonly value: Output }
  | { readonly kind: "failed"; readonly error: unknown };

/** `run` never rejects. It resolves after the write and every declared refetch finish. */
export function useResourceMutation<Input, Output>(command: Command<Input, Output>) {
  const spec = command[commandSpec];
  const { optimistic, refetchAfterFailure } = spec;
  const queryClient = useQueryClient();
  const refetch = () =>
    queryClient.invalidateQueries({
      predicate: (query) => inFamilies(query.queryKey, spec.invalidates),
    });
  const mutation = useMutation<Output, unknown, Input, Rollback | undefined>({
    mutationFn: spec.persist,
    onMutate: optimistic && ((input) => optimistic(queryClient, input)),
    onSuccess: async (output, input) => {
      if (spec.successTitle) toast.add({ type: "success", title: spec.successTitle(input) });
      await spec.saved?.(queryClient, input, output);
      if (!refetchAfterFailure) await refetch();
    },
    onError: (_error, input, rollback) => {
      rollback?.();
      toast.add({ type: "error", title: spec.failureTitle(input) });
    },
    onSettled: refetchAfterFailure && refetch,
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
    isPending: mutation.isPending,
    pendingInput: mutation.isPending ? mutation.variables : undefined,
  } as const;
}

/** For a caller that must see a failed write, like a form that stays open: rejects with its error. */
export async function orThrow<Output>(saving: Promise<SaveResult<Output>>): Promise<Output> {
  const result = await saving;
  if (result.kind === "failed") throw result.error;
  return result.value;
}
