import { log } from "evlog";

export type Dependency = {
  readonly name: string;
  readonly ping: () => Promise<void>;
};

export const readinessCheck = (
  dependencies: readonly Dependency[],
  timeoutMs: number,
): (() => Promise<string[]>) => {
  const inFlight = new Map<string, Promise<void>>();

  const sharedPing = ({ name, ping }: Dependency): Promise<void> => {
    const pending = inFlight.get(name);
    if (pending) return pending;
    const probe = (async () => {
      try {
        await ping();
      } finally {
        inFlight.delete(name);
      }
    })();
    inFlight.set(name, probe);
    return probe;
  };

  const failedPing = async (dependency: Dependency): Promise<string | undefined> => {
    const { name } = dependency;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error(`no answer within ${timeoutMs} ms`)), timeoutMs);
    });
    try {
      await Promise.race([sharedPing(dependency), deadline]);
      return undefined;
    } catch (error) {
      const cause = error instanceof Error && error.cause instanceof Error ? error.cause : error;
      log.error({
        msg: "health check failed",
        dependency: name,
        reason: cause instanceof Error ? cause.message : String(cause),
      });
      return name;
    } finally {
      clearTimeout(timer);
    }
  };

  return async () => {
    const failed = await Promise.all(dependencies.map(failedPing));
    return failed.filter((name) => name !== undefined);
  };
};
