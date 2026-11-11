import "@fontsource-variable/inter/opsz.css";
import "@fontsource-variable/orbitron/index.css";
import { HugeiconsIcon } from "@hugeicons/react";
import { Loading03Icon } from "@hugeicons/core-free-icons";
import { createRouter } from "@tanstack/react-router";
import ReactDOM from "react-dom/client";
import { routeTree } from "./routeTree.gen";
import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import type { RouterAppContext } from "./routes/__root";
import { NotFound } from "@/components/errors/not-found";
import { RouteError } from "@/components/errors/route-error";
import { AuthRouterProvider } from "@/components/auth/auth-router-provider";
import { createSessionSource } from "@/lib/session";
import { createQueryClient } from "@/data/client";
import { loadFont } from "@/lib/load-font";

// Browsers lay text out in a fallback face until its webfont arrives, then move it. Starting
// Inter here, before the first route renders, lets the first layout use it.
void loadFont('1em "Inter Variable"');

const queryClient = createQueryClient();
const sessions = createSessionSource();

const router = createRouter({
  routeTree,
  defaultPreload: false,
  context: {
    readSession: sessions.read,
  } satisfies RouterAppContext,
  defaultPendingComponent: () => (
    <div className="flex min-h-dvh items-center justify-center pt-8">
      <HugeiconsIcon icon={Loading03Icon} className="animate-spin" />
    </div>
  ),
  defaultNotFoundComponent: NotFound,
  defaultErrorComponent: RouteError,
  scrollRestoration: true,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

const rootElement = document.querySelector("#app");

if (!rootElement) {
  throw new Error("Root element not found");
}

if (!rootElement.innerHTML) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <QueryClientProvider client={queryClient}>
      <AuthRouterProvider router={router} sessions={sessions} />
      {import.meta.env.DEV && <ReactQueryDevtools initialIsOpen={false} />}
    </QueryClientProvider>,
  );
}
