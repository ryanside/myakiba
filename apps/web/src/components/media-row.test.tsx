import { afterEach, expect, test } from "bun:test";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import type { ComponentProps } from "react";
import { ListMemberGrid } from "./lists/list-member-grid";

afterEach(() => {
  window.getSelection()?.removeAllRanges();
  cleanup();
});

const members = [
  {
    id: "member-miku",
    position: 0,
    type: "item",
    targetId: "item-miku",
    title: "Miku",
    image: "https://example.com/miku.jpg",
    itemExternalId: 123,
  },
  {
    id: "member-rin",
    position: 1,
    type: "item",
    targetId: "item-rin",
    title: "Rin",
    image: "https://example.com/rin.jpg",
    itemExternalId: 124,
  },
] satisfies ComponentProps<typeof ListMemberGrid>["members"];

async function renderRows({ selected = false } = {}) {
  const root = createRootRoute({ component: Outlet });
  const home = createRoute({
    getParentRoute: () => root,
    path: "/",
    component: () => (
      <ListMemberGrid
        members={members}
        viewMode="list"
        totalCount={members.length}
        isSaving={false}
        sortingDisabled={false}
        removingMemberIds={undefined}
        hasNextPage={false}
        isFetchingNextPage={false}
        selectedIds={new Set(selected ? members.map((member) => member.id) : [])}
        onLoadMore={async () => ({ isFetchNextPageError: false })}
        onRemove={async () => {}}
        onMove={async () => {}}
        onClearSelection={() => {}}
        onToggleSelection={() => {}}
      />
    ),
  });
  const item = createRoute({
    getParentRoute: () => root,
    path: "/item/$externalId",
    component: () => <p>Item destination</p>,
  });
  const router = createRouter({
    routeTree: root.addChildren([home, item]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  await router.load();
  render(<RouterProvider router={router} />);
  return router;
}

function titleLink(title = "Miku"): HTMLAnchorElement {
  return screen.getByText<HTMLAnchorElement>(title, { selector: "a" });
}

function rowOf(title = "Miku"): HTMLElement {
  const row = titleLink(title).closest<HTMLElement>(".group\\/item");
  if (!row) throw new Error(`Missing row for ${title}`);
  return row;
}

function metadata(): HTMLElement {
  return within(rowOf()).getByText("Item");
}

function removeButton(): HTMLElement {
  return within(rowOf()).getByRole("button", { name: "Remove Miku from List" });
}

function image(): HTMLElement {
  const thumbnail = rowOf().querySelector("img");
  if (!thumbnail) throw new Error("Missing row image");
  return thumbnail;
}

test("list containers have no gap between rows", async () => {
  await renderRows();
  expect(commonAncestor(rowOf("Miku"), rowOf("Rin")).className).not.toMatch(
    /(?:^|\s)(?:\S*:)?gap(?:-y)?-/,
  );
});

test("clicking row metadata follows the title link", async () => {
  const router = await renderRows();
  fireEvent.click(metadata());
  await waitFor(() => expect(router.state.location.pathname).toBe("/item/123"));
});

test("releasing a text selection in row metadata keeps the current page", async () => {
  const router = await renderRows();
  const range = document.createRange();
  range.selectNodeContents(metadata());
  window.getSelection()?.addRange(range);
  expect(window.getSelection()?.toString()).toBe("Item");
  fireEvent.click(metadata());
  expect(router.state.location.pathname).toBe("/");
});

test("row controls and their surrounding cluster never follow the title link", async () => {
  const router = await renderRows();
  const remove = removeButton();
  const cluster = remove.closest('[data-slot="item-controls"]');
  if (!cluster) throw new Error("Missing control cluster");
  fireEvent.click(remove);
  fireEvent.click(cluster);
  expect(router.state.location.pathname).toBe("/");
});

test("the title is the row's only link and keyboard navigation target", async () => {
  await renderRows();
  const links = within(rowOf()).getAllByRole("link");
  expect(links).toHaveLength(1);
  expect(links[0]?.textContent).toBe("Miku");
  expect(links[0]?.getAttribute("href")).toBe("/item/123");
  expect(rowOf().hasAttribute("tabindex")).toBe(false);
});

test.each(["Meta", "Control", "Shift", "middle"] as const)(
  "%s row clicks delegate to the title link in a new tab",
  async (modifier) => {
    const router = await renderRows();
    const link = titleLink();
    const clicks: string[] = [];
    link.addEventListener("click", (event) => {
      clicks.push(link.target);
      event.preventDefault();
    });
    if (modifier === "middle") middleClick(metadata(), metadata());
    else
      fireEvent.click(metadata(), {
        metaKey: modifier === "Meta",
        ctrlKey: modifier === "Control",
        shiftKey: modifier === "Shift",
      });
    expect(clicks).toEqual(["_blank"]);
    expect(link.hasAttribute("target")).toBe(false);
    expect(router.state.location.pathname).toBe("/");
  },
);

function middleClick(pressed: Element, released: Element): boolean {
  fireEvent.pointerDown(pressed, { button: 1 });
  const notPrevented = fireEvent.mouseDown(pressed, { button: 1 });
  fireEvent.pointerUp(released, { button: 1 });
  fireEvent.mouseUp(released, { button: 1 });
  fireEvent(
    commonAncestor(pressed, released),
    new window.MouseEvent("auxclick", { bubbles: true, cancelable: true, button: 1 }),
  );
  return notPrevented;
}

function leftClick(pressed: Element, released: Element): void {
  fireEvent.pointerDown(pressed, { button: 0 });
  fireEvent.mouseDown(pressed, { button: 0 });
  fireEvent.pointerUp(released, { button: 0 });
  fireEvent.mouseUp(released, { button: 0 });
  fireEvent.click(commonAncestor(pressed, released), { button: 0 });
}

function commonAncestor(first: Element, second: Element): Element {
  let ancestor: Element | null = first;
  while (ancestor && !ancestor.contains(second)) ancestor = ancestor.parentElement;
  if (!ancestor) throw new Error("No common ancestor");
  return ancestor;
}

test("a middle press on a control released over metadata keeps the current page", async () => {
  const router = await renderRows();
  middleClick(removeButton(), metadata());
  expect(router.state.location.pathname).toBe("/");
});

test.each([
  ["a control", "row metadata", removeButton, metadata],
  ["row metadata", "a control", metadata, removeButton],
  ["the image", "a control", image, removeButton],
] as const)(
  "a left press on %s released on %s keeps the current page",
  async (_pressed, _released, pressed, released) => {
    const router = await renderRows();
    leftClick(pressed(), released());
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });
    expect(router.state.location.pathname).toBe("/");
  },
);

test("a left press and release on row metadata follows the title link", async () => {
  const router = await renderRows();
  leftClick(metadata(), metadata());
  await waitFor(() => expect(router.state.location.pathname).toBe("/item/123"));
});

test("a middle press on row metadata blocks autoscroll and opens the title link in a new tab", async () => {
  const router = await renderRows();
  const link = titleLink();
  const clicks: string[] = [];
  link.addEventListener("click", (event) => {
    clicks.push(link.target);
    event.preventDefault();
  });
  fireEvent.pointerDown(metadata(), { button: 1 });
  expect(fireEvent.mouseDown(metadata(), { button: 1 })).toBe(false);
  expect(clicks).toEqual([]);
  fireEvent.pointerUp(metadata(), { button: 1 });
  fireEvent.mouseUp(metadata(), { button: 1 });
  expect(clicks).toEqual([]);
  fireEvent(
    metadata(),
    new window.MouseEvent("auxclick", { bubbles: true, cancelable: true, button: 1 }),
  );
  expect(clicks).toEqual(["_blank"]);
  expect(router.state.location.pathname).toBe("/");
});

test("a middle press on the title link keeps the browser's own middle-click", async () => {
  await renderRows();
  expect(fireEvent.mouseDown(titleLink(), { button: 1 })).toBe(true);
});

// Tailwind's ring-N paints N px outside the row and inset-ring-N paints N px inside it, so where
// two selected rows meet, each side's band is the wider of one row's inside and the other's outside.
test("consecutive selected rows share one 2 px edge, as wide as a single row's", async () => {
  await renderRows({ selected: true });
  for (const title of ["Miku", "Rin"]) {
    const className = rowOf(title).className;
    const width = (prefix: string) => {
      const match = className.match(new RegExp(`(?:^|\\s)${prefix}(?:-(\\d+))?(?=\\s|$)`));
      return match ? Number(match[1] ?? 1) : 0;
    };
    const outside = width("ring");
    const inside = width("inset-ring");
    expect(outside + inside).toBe(2);
    expect(2 * Math.max(inside, outside)).toBe(2);
  }
});
