import { afterEach, expect, test } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { ItemTitleCell } from "./item-title-cell";

afterEach(cleanup);

const TITLE =
  "Hatsune Miku Symphony 2026 Ver. Extremely Long Title That Overflows The Column 1/7 Complete Figure";

async function renderCell(walkedByKeys: boolean) {
  const root = createRootRoute({ component: Outlet });
  const home = createRoute({
    getParentRoute: () => root,
    path: "/",
    component: () => (
      <ItemTitleCell
        itemId="item-1"
        title={TITLE}
        externalId={900_001}
        image={null}
        walkedByKeys={walkedByKeys}
      />
    ),
  });
  const router = createRouter({
    routeTree: root.addChildren([home]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  await router.load();
  render(<RouterProvider router={router} />);
}

test.each([
  ["in Collection and Order Items", false],
  ["in Add", true],
])(
  "%s, a long title ends with an ellipsis and keeps its full text",
  async (_table, walkedByKeys) => {
    await renderCell(walkedByKeys);

    const link = screen.getByRole("link", { name: TITLE });
    const classes = link.className.split(/\s+/);
    // An inline box ignores text-overflow, so the cell clips the title mid-word instead.
    expect(classes).toContain("block");
    expect(classes).toContain("truncate");
    expect(link.title).toBe(TITLE);
  },
);
