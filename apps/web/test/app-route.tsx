import { afterEach } from "bun:test";
import type { QueryClient } from "@tanstack/react-query";
import { QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react/pure";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import type { AnyValidator, RouteComponent } from "@tanstack/react-router";
import { signedInSession } from "./session";

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
});

/** Answers every request the app sends until the test ends. */
export function stubFetch(respond: (request: Request) => Response | Promise<Response>): void {
  globalThis.fetch = Object.assign(
    async (input: RequestInfo | URL, init?: RequestInit) => respond(new Request(input, init)),
    { preconnect: realFetch.preconnect },
  );
}

export type AppPage = {
  readonly path: `/${string}`;
  readonly component: RouteComponent;
  readonly validateSearch: AnyValidator;
};

/** Renders `url` among `pages` inside the signed-in `(app)` layout. */
export async function renderAppRoute(
  url: string,
  pages: readonly AppPage[],
  queryClient: QueryClient,
): Promise<void> {
  const root = createRootRoute({ component: Outlet });
  const app = createRoute({
    getParentRoute: () => root,
    id: "(app)",
    component: Outlet,
    beforeLoad: () => ({ session: signedInSession() }),
  });
  const router = createRouter({
    routeTree: root.addChildren([
      app.addChildren(pages.map((page) => createRoute({ getParentRoute: () => app, ...page }))),
    ]),
    history: createMemoryHistory({ initialEntries: [url] }),
  });
  await router.load();
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}
