import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import {
  HeadContent,
  Outlet,
  createRootRouteWithContext,
} from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import "../index.css";
import { authClient } from "@/lib/auth-client";

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
        <Toaster richColors position="top-center" />
      </ThemeProvider>
      {import.meta.env.DEV && (
        <TanStackRouterDevtools position="bottom-right" />
      )}{" "}
    </>
  );
}
