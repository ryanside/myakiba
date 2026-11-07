import { afterEach, expect, test } from "bun:test";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Sidebar, SidebarProvider, SidebarTrigger } from "./sidebar";

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

function renderToggleableSidebar(): HTMLElement {
  const { container } = render(
    <SidebarProvider defaultOpen>
      <Sidebar collapsible="offcanvas">
        <a href="/orders">Orders</a>
      </Sidebar>
      <SidebarTrigger />
    </SidebarProvider>,
  );
  const wrapper = container.querySelector<HTMLElement>("[data-slot=sidebar-wrapper]");
  if (!wrapper) throw new Error("no sidebar wrapper");
  return wrapper;
}

function sidebarState(): string | undefined {
  return document.querySelector<HTMLElement>("[data-slot=sidebar]")?.dataset.state;
}

test("the keyboard shortcut snaps the sidebar shut", () => {
  const wrapper = renderToggleableSidebar();

  fireEvent.keyDown(window, { key: "b", metaKey: true });

  expect(sidebarState()).toBe("collapsed");
  expect(Object.hasOwn(wrapper.dataset, "instant")).toBe(true);
});

test("the toggle button slides the sidebar shut", () => {
  const wrapper = renderToggleableSidebar();

  fireEvent.click(screen.getByRole("button", { name: "Toggle Sidebar" }));

  expect(sidebarState()).toBe("collapsed");
  expect(Object.hasOwn(wrapper.dataset, "instant")).toBe(false);
});
