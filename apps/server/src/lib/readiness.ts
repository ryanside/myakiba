import { log } from "evlog";

export type Dependency = {
  readonly name: string;
  readonly ping: () => Promise<void>;
};

type Waiter = (failure: string | undefined) => void;

export const readinessCheck = (
  dependencies: readonly Dependency[],
  timeoutMs: number,
): (() => Promise<string[]>) => {
  const waitersByName = new Map<string, Set<Waiter>>();

  const probe = async ({ name, ping }: Dependency, waiters: Set<Waiter>): Promise<void> => {
    let failure: string | undefined;
    try {
      await ping();
    } catch (error) {
      const cause = error instanceof Error && error.cause instanceof Error ? error.cause : error;
      failure = cause instanceof Error ? cause.message : String(cause);
    }
    waitersByName.delete(name);
    for (const settle of waiters) settle(failure);
  };

  const pingFailure = (dependency: Dependency): Promise<string | undefined> =>
    new Promise((resolve) => {
      const pending = waitersByName.get(dependency.name);
      const waiters = pending ?? new Set<Waiter>();
      const timer = setTimeout(() => {
        waiters.delete(settle);
        resolve(`no answer within ${timeoutMs} ms`);
      }, timeoutMs);
      const settle: Waiter = (failure) => {
        clearTimeout(timer);
        resolve(failure);
      };
      waiters.add(settle);
      if (pending) return;
      waitersByName.set(dependency.name, waiters);
      void probe(dependency, waiters);
    });

  const failedPing = async (dependency: Dependency): Promise<string | undefined> => {
    const failure = await pingFailure(dependency);
    if (failure === undefined) return undefined;
    log.error({ msg: "health check failed", dependency: dependency.name, reason: failure });
    return dependency.name;
  };

  return async () => {
    const failed = await Promise.all(dependencies.map(failedPing));
    return failed.filter((name) => name !== undefined);
  };
};
