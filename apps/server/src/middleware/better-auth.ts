import { Elysia } from "elysia";
import { auth } from "@myakiba/auth/server";

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

      if (!session) return status(401);

      return {
        user: session.user,
        session: session.session,
      };
    },
  },
});
