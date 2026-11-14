import { ThemeProvider } from "next-themes";
import { MotionGlobalConfig } from "motion/react";
import { useLayoutEffect } from "react";
import { Toaster } from "@/components/ui/toast";
import { TooltipProvider } from "@/components/ui/tooltip";
import { HeadContent, Outlet, createRootRouteWithContext } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import { useMotionPreference } from "@/hooks/use-appearance";
import "../index.css";
import type { QueryClient } from "@tanstack/react-query";
import type { SessionCheck } from "@/lib/session";

export interface RouterAppContext {
  queryClient: QueryClient;
  readSession: () => Promise<SessionCheck>;
}

export const Route = createRootRouteWithContext<RouterAppContext>()({
  component: RootComponent,
});

function RootComponent() {
  const { reduce } = useMotionPreference();

  // A layout effect, so the attribute every reduced-motion CSS rule and motion-reduce: utility keys
  // on is set before first paint.
  // CSS cannot stop Motion, and Motion's own reducedMotion still runs opacity and filter animations.
  // The flag reaches only animations that start after it is set, so loops stop themselves.
  useLayoutEffect(() => {
    document.documentElement.toggleAttribute("data-reduce-motion", reduce);
    const previous = MotionGlobalConfig.skipAnimations;
    MotionGlobalConfig.skipAnimations = reduce;
    return () => {
      MotionGlobalConfig.skipAnimations = previous;
    };
  }, [reduce]);

  return (
    <>
      <HeadContent />
      <ThemeProvider
        attribute="class"
        defaultTheme="system"
        disableTransitionOnChange
        storageKey="vite-ui-theme"
      >
        <TooltipProvider>
          <div className="grid grid-rows-[auto_1fr] min-h-dvh">
            <Outlet />
          </div>
        </TooltipProvider>
        <Toaster />
      </ThemeProvider>
      {import.meta.env.DEV && <TanStackRouterDevtools position="bottom-right" />}{" "}
    </>
  );
}
