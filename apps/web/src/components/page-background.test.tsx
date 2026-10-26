import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { PageBackground } from "@/components/page-background";

afterEach(cleanup);

async function backgroundAt(pathname: string) {
  const root = createRootRoute({
    component: () => (
      <>
        <PageBackground />
        <Outlet />
      </>
    ),
  });
  const page = () => <h1>Page</h1>;
  const routes = ["/orders", "/orders/$id", "/item/$externalId"].map((path) =>
    createRoute({ getParentRoute: () => root, path, component: page }),
  );
  const router = createRouter({
    routeTree: root.addChildren(routes),
    history: createMemoryHistory({ initialEntries: [pathname] }),
  });
  render(<RouterProvider router={router} />);
  await screen.findByRole("heading", { name: "Page" });
  return document.querySelector(".page-background img")?.getAttribute("src") ?? null;
}

describe("page background", () => {
  test("the Orders list shows the Orders background", async () => {
    expect(await backgroundAt("/orders")).toContain("17-night-calendar-bitgrain.webp");
  });

  test("an order detail page shows no background", async () => {
    expect(await backgroundAt("/orders/uy1ru0816jq10g4ooo73ckhw")).toBe(null);
  });

  test("an item page shows no background", async () => {
    expect(await backgroundAt("/item/1093283")).toBe(null);
  });
});
