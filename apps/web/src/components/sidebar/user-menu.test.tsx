import { afterEach, expect, test } from "bun:test";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
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
  const router = createRouter({
    routeTree: createRootRoute({ component: () => <UserMenu session={session} /> }),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  render(
    <ThemeProvider>
      <RouterProvider router={router} />
    </ThemeProvider>,
  );
}

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
