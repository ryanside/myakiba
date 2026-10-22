import { useEffect, useRef } from "react";
import { RouterProvider } from "@tanstack/react-router";
import type { AnyRouter } from "@tanstack/react-router";
import { authClient, classifySession } from "@/lib/auth-client";
import { useClearServerData, useResetServerData } from "@/data/resources/session";
import type { SessionSource } from "@/lib/session";
import { toast } from "@/components/ui/toast";

export function AuthRouterProvider({
  router,
  sessions,
}: {
  router: AnyRouter;
  sessions: SessionSource;
}) {
  const sessionState = authClient.useSession();
  const { data: session } = sessionState;
  const state = classifySession(sessionState);
  const userId = session?.user.id ?? null;
  const settled = useRef(false);
  const confirmedUserId = useRef<string | null>(null);
  const clearServerData = useClearServerData();
  const resetServerData = useResetServerData();

  useEffect(() => {
    if (state === "pending") return;
    let resetting: Promise<void> | undefined;
    if (confirmedUserId.current !== null && confirmedUserId.current !== userId) {
      // Reads on screen keep their data through a clear, so another account resets them instead.
      if (userId === null) clearServerData();
      else resetting = resetServerData();
    }
    confirmedUserId.current = userId;
    sessions.settle({ session, unavailable: state === "unavailable" });
    if (!settled.current) {
      settled.current = true;
      return;
    }
    async function reload() {
      try {
        await Promise.all([resetting, router.invalidate()]);
      } catch {
        toast.add({ type: "error", title: "Couldn't update your session. Refresh to try again." });
      }
    }
    void reload();
  }, [router, sessions, session, userId, state, clearServerData, resetServerData]);

  return <RouterProvider router={router} />;
}
