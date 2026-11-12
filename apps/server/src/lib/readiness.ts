import { Result } from "better-result";
import { log } from "evlog";
import { DependencyUnavailable } from "@/lib/errors/dependency-unavailable";

export type Dependency = {
  readonly name: string;
  readonly ping: () => Promise<void>;
};

type Ping = Result<void, DependencyUnavailable>;
type Waiter = (answer: Ping) => void;

export const readinessCheck = (
  dependencies: readonly Dependency[],
  timeoutMs: number,
): (() => Promise<string[]>) => {
  const waitersByName = new Map<string, Set<Waiter>>();

  const probe = async ({ name, ping }: Dependency, waiters: Set<Waiter>): Promise<void> => {
    const answer = await Result.tryPromise({
      try: () => ping(),
      catch: (error) => {
        const cause = error instanceof Error && error.cause instanceof Error ? error.cause : error;
        const reason = cause instanceof Error ? cause.message : String(cause);
        return new DependencyUnavailable({ dependency: name, reason });
      },
    });
    waitersByName.delete(name);
    for (const settle of waiters) settle(answer);
  };

  const pingOf = (dependency: Dependency): Promise<Ping> =>
    new Promise((resolve) => {
      const pending = waitersByName.get(dependency.name);
      const waiters = pending ?? new Set<Waiter>();
      const timer = setTimeout(() => {
        waiters.delete(settle);
        resolve(
          Result.err(
            new DependencyUnavailable({
              dependency: dependency.name,
              reason: `no answer within ${timeoutMs} ms`,
            }),
          ),
        );
      }, timeoutMs);
      const settle: Waiter = (answer) => {
        clearTimeout(timer);
        resolve(answer);
      };
      waiters.add(settle);
      if (pending) return;
      waitersByName.set(dependency.name, waiters);
      void probe(dependency, waiters);
    });

  const failedPing = async (dependency: Dependency): Promise<string | undefined> => {
    const answer = await pingOf(dependency);
    if (answer.isOk()) return undefined;
    log.error({
      msg: "health check failed",
      dependency: dependency.name,
      reason: answer.error.reason,
    });
    return dependency.name;
  };

  return async () => {
    const failed = await Promise.all(dependencies.map(failedPing));
    return failed.filter((name) => name !== undefined);
  };
};
