import { afterAll, afterEach, expect, mock, test } from "bun:test";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

Object.defineProperty(document, "fonts", {
  configurable: true,
  value: { ready: Promise.resolve() },
});
afterAll(() => {
  Reflect.deleteProperty(document, "fonts");
});

const navigations: { readonly to: string }[] = [];
const realRouter = await import("@tanstack/react-router");
await mock.module("@tanstack/react-router", () => ({
  ...realRouter,
  useNavigate: () => async (to: { readonly to: string }) => {
    navigations.push(to);
  },
  useRouter: () => ({ history: { canGoBack: () => false, back: () => {} } }),
  useLocation: () => "/lists/list-1",
  Link: ({ children }: { readonly children: ReactNode }) => <a href="#back">{children}</a>,
}));

const { Route } = await import("@/routes/(app)/lists_.$listId");
Object.assign(Route, { useParams: () => ({ listId: "list-1" }) });
const ListPage = Route.options.component as () => ReactNode;

const realFetch = globalThis.fetch;
const deletes: unknown[] = [];

afterEach(() => {
  cleanup();
  globalThis.fetch = realFetch;
  navigations.length = 0;
  deletes.length = 0;
});

function serveListPage() {
  globalThis.fetch = Object.assign(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init);
      if (request.method === "DELETE") {
        deletes.push(await request.json());
        return new Response(null, { status: 200 });
      }
      if (new URL(request.url).pathname === "/api/lists/list-1") {
        return Response.json({ id: "list-1", title: "Alpha List", description: "" });
      }
      return Response.json({ items: [], totalCount: 0 });
    },
    { preconnect: realFetch.preconnect },
  );
}

test("Delete on the List page asks first, then deletes the List and leaves the page", async () => {
  serveListPage();
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <ListPage />
    </QueryClientProvider>,
  );
  await screen.findByRole("heading", { name: "Alpha List" });
  expect(screen.queryByRole("button", { name: "More List actions" })).toBeNull();

  fireEvent.click(screen.getByRole("button", { name: "Delete List" }));
  const dialog = await screen.findByRole("dialog");
  expect(within(dialog).getByText("Delete List?")).toBeTruthy();
  expect(deletes).toEqual([]);

  act(() => within(dialog).getByRole("button", { name: "Delete" }).click());
  await waitFor(() => expect(deletes).toEqual([{ listIds: ["list-1"] }]));
  await waitFor(() => expect(navigations).toEqual([{ to: "/lists" }]));
});
