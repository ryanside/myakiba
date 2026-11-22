import { afterEach, expect, mock, test } from "bun:test";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Result } from "better-result";
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
import { signedInSession } from "../../../test/session";

const session = signedInSession();
const signOut = mock(async () => ({ data: { success: true }, error: null }));
const authModule = await import("@/lib/auth-client");
const endSession: typeof authModule.endSession = async (operation) => {
  await operation();
  return Result.ok();
};
await mock.module("@/lib/auth-client", () => ({
  ...authModule,
  authClient: { signOut },
  endSession,
}));
const { default: UserMenu } = await import("./user-menu");

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

async function openWithKeyboard(key: "{Enter}" | " ") {
  const user = userEvent.setup();
  screen.getByRole("button", { name: "Account menu" }).focus();
  await user.keyboard(key);
  await screen.findByRole("menu");
  return user;
}

function focusedName() {
  const focused = document.activeElement;
  return focused?.getAttribute("aria-label") ?? focused?.textContent ?? "";
}

test.each([
  { key: "{Enter}" as const, label: "Enter" },
  { key: " " as const, label: "Space" },
])(
  "opening the account menu with $label focuses the highlighted Settings, and Enter opens it",
  async ({ key }) => {
    const router = renderUserMenu();
    await screen.findByRole("button", { name: "Account menu" });

    const user = await openWithKeyboard(key);
    const settings = screen.getByRole("menuitem", { name: "Settings" });
    await waitFor(() => {
      expect(focusedName()).toBe("Settings");
      expect(settings.dataset.highlighted).toBe("");
    });

    await user.keyboard("{Enter}");
    await screen.findByRole("heading", { name: "Settings" });
    expect(router.state.location.pathname).toBe("/settings");
  },
);

test("ArrowDown then Enter in the account menu signs out", async () => {
  renderUserMenu();
  await screen.findByRole("button", { name: "Account menu" });

  const user = await openWithKeyboard("{Enter}");
  await waitFor(() => expect(focusedName()).toBe("Settings"));
  await user.keyboard("{ArrowDown}");
  expect(focusedName()).toBe("Sign Out");
  await user.keyboard("{Enter}");

  await waitFor(() => expect(signOut).toHaveBeenCalledTimes(1));
});

test("the theme tabs are reached with Tab, switched with the arrow keys, and Escape returns to the trigger", async () => {
  localStorage.setItem("theme", "system");
  renderUserMenu();
  await screen.findByRole("button", { name: "Account menu" });

  const user = await openWithKeyboard("{Enter}");
  await waitFor(() => expect(focusedName()).toBe("Settings"));
  await user.keyboard("{Tab}");
  expect(focusedName()).toBe("System");
  await user.keyboard("{ArrowLeft}");
  expect(focusedName()).toBe("Dark");
  await user.keyboard("{Enter}");
  expect(localStorage.getItem("theme")).toBe("dark");
  expect(screen.getByRole("tab", { name: "Dark" }).getAttribute("aria-selected")).toBe("true");

  await user.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
  expect(focusedName()).toBe("Account menu");
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
