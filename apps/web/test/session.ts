import type { Session } from "@/lib/session";

type SignedIn = NonNullable<Session>;

export function signedInSession(
  overrides: { session?: Partial<SignedIn["session"]>; user?: Partial<SignedIn["user"]> } = {},
): SignedIn {
  return {
    session: {
      id: "session-1",
      token: "test-token",
      userId: "user-1",
      expiresAt: new Date(Date.now() + 3_600_000),
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides.session,
    },
    user: {
      id: "user-1",
      name: "Collector",
      username: "collector",
      email: "collector@example.com",
      emailVerified: true,
      currency: "USD",
      dateFormat: "MM/DD/YYYY",
      hasSeenOnboarding: true,
      banned: false,
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides.user,
    },
  };
}
