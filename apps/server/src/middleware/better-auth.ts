import { Result } from "better-result";
import { Unauthenticated } from "./errors/unauthenticated";
import { Elysia } from "elysia";
import { auth } from "@myakiba/auth/server";
import { Viewer } from "@/domain/viewer";

type Session = Awaited<ReturnType<typeof auth.api.getSession>>;

// A route inside privateApi can also set `auth: true`, so the macro can run twice for one request.
const sessions = new WeakMap<Request, Promise<Session>>();

export const betterAuth = new Elysia({ name: "better-auth" }).macro({
  auth: {
    async resolve({ status, request }) {
      let pending = sessions.get(request);
      if (!pending) {
        pending = auth.api.getSession({ headers: request.headers });
        sessions.set(request, pending);
      }
      const session = await pending;

      const authenticated = session ? Result.ok(session) : Result.err(new Unauthenticated());
      if (authenticated.isErr()) return status(authenticated.error.status);
      return {
        user: authenticated.value.user,
        session: authenticated.value.session,
        viewer: Viewer.fromSession(authenticated.value),
      };
    },
  },
});
