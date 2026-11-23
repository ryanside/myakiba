import { afterEach, expect, test } from "bun:test";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { ComputerIcon, Moon02Icon, Sun01Icon } from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react";
import { ThemeProvider } from "next-themes";
import UserMenu from "./user-menu";
import { signedInSession } from "../../../test/session";

const session = signedInSession();

afterEach(() => {
  cleanup();
  localStorage.removeItem("theme");
  delete document.documentElement.dataset.theme;
  document.documentElement.style.colorScheme = "";
});

function renderUserMenu() {
  const root = createRootRoute({
    component: () => (
      <>
        <UserMenu session={session} />
        <Outlet />
      </>
    ),
  });
  const home = createRoute({ getParentRoute: () => root, path: "/" });
  const settings = createRoute({
    getParentRoute: () => root,
    path: "/settings",
    component: () => <h1>Settings</h1>,
  });
  const router = createRouter({
    routeTree: root.addChildren([home, settings]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  render(
    <ThemeProvider>
      <RouterProvider router={router} />
    </ThemeProvider>,
  );
  return router;
}

test("the account menu holds Settings and Sign Out, and no Profile", async () => {
  const router = renderUserMenu();

  fireEvent.click(await screen.findByRole("button", { name: "Account menu" }));
  const items = await screen.findAllByRole("menuitem");
  expect(items.map((item) => item.textContent)).toEqual(["Settings", "Sign Out"]);

  fireEvent.click(screen.getByRole("menuitem", { name: "Settings" }));
  await screen.findByRole("heading", { name: "Settings" });
  expect(router.state.location.pathname).toBe("/settings");
});

test("the account menu's theme tablist has an accessible name", async () => {
  renderUserMenu();

  fireEvent.click(await screen.findByRole("button", { name: "Account menu" }));
  await screen.findByRole("tablist", { name: "Theme" });
});

test.each([
  { name: "Light", value: "light", initial: "dark" },
  { name: "Dark", value: "dark", initial: "light" },
  { name: "System", value: "system", initial: "dark" },
])(
  "the account menu's $name theme tab has an accessible name and sets the theme",
  async ({ name, value, initial }) => {
    localStorage.setItem("theme", initial);
    renderUserMenu();

    fireEvent.click(await screen.findByRole("button", { name: "Account menu" }));
    expect(screen.getAllByRole("tab").map((tab) => tab.getAttribute("aria-label"))).toEqual([
      "Light",
      "Dark",
      "System",
    ]);
    const tab = await screen.findByRole("tab", { name });
    expect(tab.getAttribute("aria-selected")).toBe("false");

    fireEvent.click(tab);

    expect(tab.getAttribute("aria-selected")).toBe("true");
    expect(localStorage.getItem("theme")).toBe(value);
  },
);

test("each account menu theme tab shows its own icon", async () => {
  renderUserMenu();

  fireEvent.click(await screen.findByRole("button", { name: "Account menu" }));

  const tabs = await screen.findAllByRole("tab");
  const pathsOf = (icon: IconSvgElement) => icon.map(([, { d }]) => String(d));
  expect(
    tabs.map((tab) => ({
      name: tab.getAttribute("aria-label"),
      paths: [...tab.querySelectorAll("path")].map((path) => path.getAttribute("d")),
    })),
  ).toEqual([
    { name: "Light", paths: pathsOf(Sun01Icon) },
    { name: "Dark", paths: pathsOf(Moon02Icon) },
    { name: "System", paths: pathsOf(ComputerIcon) },
  ]);
});
