import { ThemeProvider } from "next-themes";
import { useLayoutEffect } from "react";
import { Toaster } from "@/components/ui/toast";
import { HeadContent, Outlet, createRootRouteWithContext } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import { useMotionPreference } from "@/hooks/use-appearance";
import "../index.css";
import type { SessionCheck } from "@/lib/session";

export interface RouterAppContext {
  readSession: () => Promise<SessionCheck>;
}

export const Route = createRootRouteWithContext<RouterAppContext>()({
  component: RootComponent,
});

function RootComponent() {
  const { reduce } = useMotionPreference();

  // A layout effect, so the attribute every reduced-motion CSS rule and motion-reduce: utility keys
  // on is set before first paint.
  useLayoutEffect(() => {
    document.documentElement.toggleAttribute("data-reduce-motion", reduce);
  }, [reduce]);

  return (
    <>
      <HeadContent />
      <ThemeProvider
        attribute="class"
        defaultTheme="dark"
        disableTransitionOnChange
        storageKey="vite-ui-theme"
      >
        <div className="grid grid-rows-[auto_1fr] min-h-dvh">
          <Outlet />
        </div>
        <Toaster />
      </ThemeProvider>
      {import.meta.env.DEV && <TanStackRouterDevtools position="bottom-right" />}{" "}
    </>
  );
}
