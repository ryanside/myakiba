import { afterEach, expect, mock, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, within } from "@testing-library/react";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import type { ReactNode } from "react";
import { HomeFooter } from "@/components/homepage/footer";
import { HomeHeader } from "@/components/homepage/header";

// The real hook needs the signed-in app route above it, and this test renders no app.
await mock.module("@/components/onboarding/onboarding-dialog", () => ({
  useOpenOnboarding: () => () => {},
}));

const { About } = await import("@/components/settings/about");

afterEach(cleanup);

const RELEASES = "https://github.com/ryanside/myakiba/releases";

function expectOpensReleases(link: HTMLElement) {
  expect(link.getAttribute("href")).toBe(RELEASES);
  expect(link.getAttribute("target")).toBe("_blank");
  expect(link.getAttribute("rel")).toBe("noopener noreferrer");
}

async function renderAt(children: ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const root = createRootRoute({
    component: () => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>,
  });
  const router = createRouter({
    routeTree: root,
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  render(<RouterProvider router={router} />);
  await screen.findAllByRole("link");
}

test("the homepage header's Changelog link opens GitHub Releases in a new tab", async () => {
  await renderAt(<HomeHeader />);

  const nav = screen.getByRole("navigation", { name: "Main" });
  expectOpensReleases(within(nav).getByRole("link", { name: "Changelog" }));
});

test("the homepage footer's Changelog link opens GitHub Releases in a new tab", async () => {
  await renderAt(<HomeFooter />);

  const nav = screen.getByRole("navigation", { name: "Footer" });
  expectOpensReleases(within(nav).getByRole("link", { name: "Changelog" }));
});

test("the Changelog setting opens GitHub Releases in a new tab", async () => {
  await renderAt(<About />);

  const row = document.querySelector<HTMLElement>("#setting-changelog");
  if (!row) throw new Error("the Changelog setting has no row");
  expectOpensReleases(within(row).getByRole("link"));
});
