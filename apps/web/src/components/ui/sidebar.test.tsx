import { afterEach, expect, test } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";
import { Sidebar, SidebarProvider } from "./sidebar";

afterEach(cleanup);

test("offcanvas sidebar links are inert only while collapsed", () => {
  const view = render(
    <SidebarProvider open={false}>
      <Sidebar collapsible="offcanvas">
        <a href="/orders">Orders</a>
      </Sidebar>
    </SidebarProvider>,
  );

  expect(screen.getByRole("link", { name: "Orders" }).closest("[inert]")).not.toBeNull();

  view.rerender(
    <SidebarProvider open>
      <Sidebar collapsible="offcanvas">
        <a href="/orders">Orders</a>
      </Sidebar>
    </SidebarProvider>,
  );

  expect(screen.getByRole("link", { name: "Orders" }).closest("[inert]")).toBeNull();
});

test.each(["icon", "none"] as const)(
  "a collapsed %s sidebar keeps its links interactive",
  (collapsible) => {
    render(
      <SidebarProvider open={false}>
        <Sidebar collapsible={collapsible}>
          <a href="/orders">Orders</a>
        </Sidebar>
      </SidebarProvider>,
    );

    expect(screen.getByRole("link", { name: "Orders" }).closest("[inert]")).toBeNull();
  },
);
