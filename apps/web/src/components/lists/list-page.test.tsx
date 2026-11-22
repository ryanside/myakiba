import { afterAll, afterEach, beforeEach, expect, mock, test } from "bun:test";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

Object.defineProperty(document, "fonts", {
  configurable: true,
  value: { ready: Promise.resolve() },
});
afterAll(() => {
  Reflect.deleteProperty(document, "fonts");
});

const realRouter = await import("@tanstack/react-router");
await mock.module("@tanstack/react-router", () => ({
  ...realRouter,
  useRouter: () => ({}),
  Link: ({ children, to, className }: { children: ReactNode; to: string; className?: string }) => (
    <a href={to} className={className}>
      {children}
    </a>
  ),
  useNavigate: () => async () => {},
}));

const { Route: listRoute } = await import("@/routes/(app)/lists_.$listId");
const { toast, Toaster } = await import("@/components/ui/toast");
Object.assign(listRoute, { useParams: () => ({ listId: "list-1" }) });

const member = (id: string, position: number) => ({
  id,
  position,
  type: "item",
  targetId: `item-${id}`,
  title: `figma ${id}`,
  image: null,
  itemExternalId: null,
});

const page = {
  members: [] as string[],
  removeStatus: 200,
  deletes: [] as string[][],
  heldRestores: [] as (() => void)[],
};

const realFetch = globalThis.fetch;

async function respond(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const request = input instanceof Request ? input : new Request(input, init);
  const { pathname } = new URL(request.url);
  if (pathname === "/api/lists/list-1") {
    return Response.json({ id: "list-1", title: "Shelf", description: "" });
  }
  if (pathname === "/api/lists/list-1/members" && request.method === "GET") {
    const items = page.members.map(member);
    return Response.json({ items, totalCount: items.length, limit: 48, offset: 0 });
  }
  if (pathname === "/api/lists/list-1/members" && request.method === "DELETE") {
    const { memberIds } = (await request.json()) as { memberIds: string[] };
    page.deletes.push(memberIds);
    if (page.removeStatus !== 200) {
      page.members = page.members.filter((id) => id !== "m1");
      return new Response("Selection not found", { status: page.removeStatus });
    }
    page.members = page.members.filter((id) => !memberIds.includes(id));
    return Response.json({
      removedCount: memberIds.length,
      removed: memberIds.map((id) => ({ type: "item", id: `item-${id}`, position: 0 })),
    });
  }
  if (pathname === "/api/lists/list-1/members/restore") {
    await new Promise<void>((resolve) => {
      page.heldRestores.push(resolve);
    });
    return Response.json({ restoredCount: 1 });
  }
  return Response.json({ lists: [] });
}

beforeEach(() => {
  globalThis.fetch = Object.assign(respond, { preconnect: realFetch.preconnect });
});

afterEach(async () => {
  await act(() => toast.close());
  cleanup();
  globalThis.fetch = realFetch;
  page.members = [];
  page.removeStatus = 200;
  page.deletes.length = 0;
  page.heldRestores.length = 0;
});

function renderListPage(memberIds: readonly string[]) {
  page.members = [...memberIds];
  const Page = listRoute.options.component;
  if (!Page) throw new Error("the List route has no component");
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <Toaster>
        <Page />
      </Toaster>
    </QueryClientProvider>,
  );
}

const removeControl = (memberId: string) =>
  screen.getByRole("button", { name: `Remove figma ${memberId} from List` });

test("the List page's Remove controls are disabled while an Undo restores", async () => {
  renderListPage(["m1", "m2"]);
  await act(async () => fireEvent.click(await screen.findByLabelText("Select figma m2")));
  await act(async () => fireEvent.click(removeControl("m1")));
  await act(async () => fireEvent.click(await screen.findByRole("button", { name: "Undo" })));
  await waitFor(() => expect(page.heldRestores.length).toBe(1));

  const whileRestoring = {
    row: removeControl("m2").hasAttribute("disabled"),
    bar: screen.getByRole("button", { name: "Remove from List" }).hasAttribute("disabled"),
  };
  await act(async () => page.heldRestores.shift()?.());

  expect(whileRestoring).toEqual({ row: true, bar: true });
  await waitFor(() => expect(removeControl("m2").hasAttribute("disabled")).toBe(false));
});

test("after a failed remove's refetch, the selection bar submits only the members still loaded", async () => {
  renderListPage(["m1", "m2"]);
  await act(async () => fireEvent.click(await screen.findByLabelText("Select figma m1")));
  await act(async () => fireEvent.click(screen.getByLabelText("Select figma m2")));
  page.removeStatus = 404;
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Remove from List" })));
  await waitFor(() => expect(screen.queryByLabelText("Select figma m1")).toBeNull());
  page.removeStatus = 200;

  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Remove from List" })));

  await waitFor(() => expect(page.deletes).toEqual([["m1", "m2"], ["m2"]]));
});
