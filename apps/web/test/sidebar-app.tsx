import { afterAll, afterEach, beforeEach } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import {
  createLazyRoute,
  createMemoryHistory,
  createRootRouteWithContext,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { SidebarProvider } from "@/components/ui/sidebar";
import type { RouterAppContext } from "@/routes/__root";

const session = {
  session: {
    id: "sidebar-session",
    token: "test-token",
    userId: "sidebar-user",
    expiresAt: new Date(Date.now() + 3_600_000),
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  user: {
    id: "sidebar-user",
    name: "Collector",
    username: "collector",
    email: "collector@example.com",
    emailVerified: true,
    currency: "USD",
    dateFormat: "MM/DD/YYYY",
    hasSeenOnboarding: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    banned: false,
    role: "user",
  },
} satisfies NonNullable<Awaited<ReturnType<RouterAppContext["readSession"]>>["session"]>;

const realRequestAnimationFrame = globalThis.requestAnimationFrame;
const realCancelAnimationFrame = globalThis.cancelAnimationFrame;
const realFetch = globalThis.fetch;
const realDecode = Image.prototype.decode;
const realImageSource = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, "src");
export const frames = new Map<number, FrameRequestCallback>();
let nextFrame = 0;
const sources = new WeakMap<HTMLImageElement, string>();
export const images: HTMLImageElement[] = [];
export const decodedImages: HTMLImageElement[] = [];
/** Images whose source contains one of these names never load or decode. */
export const stalled = new Set<string>();

globalThis.fetch = Object.assign(async () => Response.json(session), {
  preconnect: realFetch.preconnect,
});
const { AppSidebar } = await import("@/components/sidebar/app-sidebar");
const { Route: appRoute } = await import("@/routes/(app)/route");

beforeEach(() => {
  globalThis.requestAnimationFrame = (renderFrame) => {
    const handle = ++nextFrame;
    frames.set(handle, renderFrame);
    return handle;
  };
  globalThis.cancelAnimationFrame = (handle) => {
    frames.delete(handle);
  };
  Object.defineProperty(HTMLImageElement.prototype, "src", {
    ...realImageSource,
    get(this: HTMLImageElement) {
      return sources.get(this) ?? "";
    },
    set(this: HTMLImageElement, source: string) {
      sources.set(this, source);
      images.push(this);
      if (!isStalled(source)) queueMicrotask(() => this.dispatchEvent(new Event("load")));
    },
  });
  Image.prototype.decode = function () {
    decodedImages.push(this);
    return isStalled(this.src) ? new Promise<void>(() => {}) : Promise.resolve();
  };
});

afterEach(() => {
  cleanup();
  for (const image of images) image.dispatchEvent(new Event("load"));
  images.length = 0;
  decodedImages.length = 0;
  stalled.clear();
  frames.clear();
  globalThis.requestAnimationFrame = realRequestAnimationFrame;
  globalThis.cancelAnimationFrame = realCancelAnimationFrame;
  Image.prototype.decode = realDecode;
  if (realImageSource) Object.defineProperty(HTMLImageElement.prototype, "src", realImageSource);
});

afterAll(() => {
  globalThis.fetch = realFetch;
});

function isStalled(source: string) {
  return [...stalled].some((name) => source.includes(name));
}

export function flushFrame() {
  const pendingFrames = [...frames.values()];
  frames.clear();
  for (const renderFrame of pendingFrames) renderFrame(performance.now());
}

/** Renders the sidebar under the real app route at /dashboard. Orders' code loads once `ordersCode` settles. */
export async function renderSidebar(ordersCode: Promise<unknown> = Promise.resolve()) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const root = createRootRouteWithContext<RouterAppContext>()({ component: Outlet });
  const app = createRoute({
    getParentRoute: () => root,
    id: "(app)",
    beforeLoad: appRoute.options.beforeLoad,
    component: () => (
      <SidebarProvider>
        <AppSidebar />
        <Outlet />
      </SidebarProvider>
    ),
  });
  const dashboard = createRoute({
    getParentRoute: () => app,
    path: "/dashboard",
    validateSearch: (search: { tab?: string }) => search,
    component: () => <h1>Dashboard</h1>,
  });
  const analytics = createRoute({ getParentRoute: () => app, path: "/analytics" });
  const orders = createRoute({ getParentRoute: () => app, path: "/orders" });
  const settings = createRoute({ getParentRoute: () => app, path: "/settings" });
  const router = createRouter({
    routeTree: root.addChildren([app.addChildren([dashboard, analytics, orders, settings])]),
    history: createMemoryHistory({ initialEntries: ["/dashboard"] }),
    context: { readSession: async () => ({ session, unavailable: false }) },
    defaultPreload: false,
    defaultPendingMinMs: 0,
  });
  const ordersImported = Promise.withResolvers<null>();
  orders.lazy(async () => {
    await ordersCode;
    ordersImported.resolve(null);
    return createLazyRoute<typeof router, "/(app)/orders">("/(app)/orders")({
      component: () => <h1>Orders</h1>,
    });
  });
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  await screen.findByRole("heading", { name: "Dashboard" });
  return {
    router,
    ordersImported: ordersImported.promise,
  };
}
