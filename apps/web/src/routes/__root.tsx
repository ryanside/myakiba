import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/toast";
import { HeadContent, Outlet, createRootRouteWithContext } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import "../index.css";
import type { authClient } from "@/lib/auth-client";

export interface RouterAppContext {
  session: Awaited<ReturnType<typeof authClient.getSession>>["data"];
}

export const Route = createRootRouteWithContext<RouterAppContext>()({
  component: RootComponent,
});

function RootComponent() {
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
