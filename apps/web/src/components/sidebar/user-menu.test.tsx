import { afterEach, expect, test } from "bun:test";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { ThemeProvider } from "next-themes";
import type { Session } from "@/lib/session";
import UserMenu from "./user-menu";

const session = {
  session: {
    id: "theme-session",
    token: "test-token",
    userId: "collector",
    expiresAt: new Date(Date.now() + 3_600_000),
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  user: {
    id: "collector",
    name: "Collector",
    username: "collector",
    email: "collector@example.com",
    emailVerified: true,
    currency: "USD",
    dateFormat: "MM/DD/YYYY",
    hasSeenOnboarding: true,
    banned: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
} satisfies NonNullable<Session>;

afterEach(() => {
  cleanup();
  localStorage.removeItem("theme");
  delete document.documentElement.dataset.theme;
  document.documentElement.style.colorScheme = "";
});

test.each([
  { name: "Light", value: "light", initial: "dark" },
  { name: "Dark", value: "dark", initial: "light" },
  { name: "System", value: "system", initial: "dark" },
])(
  "the account menu's $name theme tab has an accessible name and sets the theme",
  async ({ name, value, initial }) => {
    localStorage.setItem("theme", initial);
    const root = createRootRoute({ component: () => <UserMenu session={session} /> });
    const router = createRouter({
      routeTree: root,
      history: createMemoryHistory({ initialEntries: ["/"] }),
    });
    render(
      <ThemeProvider>
        <RouterProvider router={router} />
      </ThemeProvider>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Account menu" }));
    const tab = await screen.findByRole("tab", { name });
    expect(tab.getAttribute("aria-selected")).toBe("false");

    fireEvent.click(tab);

    expect(tab.getAttribute("aria-selected")).toBe("true");
    expect(localStorage.getItem("theme")).toBe(value);
  },
);
