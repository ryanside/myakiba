import type { authClient } from "@/lib/auth-client";

export type Session = Awaited<ReturnType<typeof authClient.getSession>>["data"];

export type SessionCheck = {
  readonly session: Session;
  readonly unavailable: boolean;
};

export class SessionUnavailableError extends Error {
  constructor() {
    super("Couldn't check your session");
    this.name = "SessionUnavailableError";
  }
}

export type SessionSource = {
  readonly read: () => Promise<SessionCheck>;
  readonly settle: (check: SessionCheck) => void;
};

/** Holds the latest settled session check. Reads before the first check wait for it. */
export function createSessionSource(): SessionSource {
  let settleFirst = () => {};
  const first = new Promise<void>((resolve) => {
    settleFirst = resolve;
  });
  let latest: SessionCheck = { session: null, unavailable: false };
  return {
    read: async () => {
      await first;
      return latest;
    },
    settle: (check) => {
      latest = check;
      settleFirst();
    },
  };
}
