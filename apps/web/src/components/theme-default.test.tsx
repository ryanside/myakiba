import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { readFileSync } from "node:fs";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { Route as AppRoot } from "@/routes/__root";
import { Appearance } from "@/components/settings/appearance";
import UserMenu from "@/components/sidebar/user-menu";
import { ThemeToggle } from "@/components/theme-toggle";
import { signedInSession } from "../../test/session";

const indexHtml = readFileSync(new URL("../../index.html", import.meta.url), "utf-8");
const prePaintScript = /<script>([\s\S]*?vite-ui-theme[\s\S]*?)<\/script>/.exec(indexHtml)?.[1];

let osScheme: "light" | "dark" = "light";
const matchMedia = window.matchMedia.bind(window);
const prefersDark = (query: string) => {
  const mediaQuery = matchMedia(query);
  if (query.includes("prefers-color-scheme: dark")) {
    Object.defineProperty(mediaQuery, "matches", { get: () => osScheme === "dark" });
  }
  return mediaQuery;
};
spyOn(window, "matchMedia").mockImplementation(prefersDark);
if (globalThis.matchMedia !== window.matchMedia) {
  spyOn(globalThis, "matchMedia").mockImplementation(prefersDark);
}

function resetDocument() {
  document.documentElement.className = "";
  document.documentElement.style.colorScheme = "";
}

beforeEach(resetDocument);
afterEach(() => {
  cleanup();
  localStorage.clear();
  resetDocument();
});

function shownScheme() {
  return ["light", "dark"].filter((scheme) => document.documentElement.classList.contains(scheme));
}

function runPrePaintScript() {
  if (!prePaintScript) throw new Error("index.html has no pre-paint theme script");
  Object.assign(window.happyDOM.settings, {
    enableJavaScriptEvaluation: true,
    suppressInsecureJavaScriptEnvironmentWarning: true,
  });
  const script = document.createElement("script");
  script.textContent = prePaintScript;
  document.head.append(script);
  script.remove();
}

function renderInApp(page: () => React.ReactNode) {
  const root = createRootRoute({ component: AppRoot.options.component });
  const router = createRouter({
    routeTree: root.addChildren([
      createRoute({ getParentRoute: () => root, path: "/", component: page }),
    ]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  render(<RouterProvider router={router} />);
}

const session = signedInSession();

describe.each(["light", "dark"] as const)("a fresh browser on a %s OS", (scheme) => {
  const other = scheme === "light" ? "dark" : "light";

  beforeEach(() => {
    osScheme = scheme;
  });

  test("paints the OS theme before the app loads", () => {
    runPrePaintScript();

    expect(shownScheme()).toEqual([scheme]);
  });

  test("shows the OS theme and every theme control reads System", async () => {
    renderInApp(() => (
      <>
        <Appearance />
        <UserMenu session={session} />
      </>
    ));

    const themes = await screen.findByRole("radiogroup", { name: "Theme" });
    expect(within(themes).getByRole("radio", { name: "System" }).getAttribute("aria-checked")).toBe(
      "true",
    );
    fireEvent.click(screen.getByRole("button", { name: "Account menu" }));
    const systemTab = await screen.findByRole("tab", { name: "System" });
    expect(systemTab.getAttribute("aria-selected")).toBe("true");
    await waitFor(() => expect(shownScheme()).toEqual([scheme]));
  });

  test("the homepage theme toggle offers the theme the page is not showing", async () => {
    renderInApp(() => <ThemeToggle />);

    await screen.findByRole("button", { name: `Switch to ${other} theme` });
  });

  test("a saved choice still wins over the OS", async () => {
    localStorage.setItem("vite-ui-theme", other);

    runPrePaintScript();
    expect(shownScheme()).toEqual([other]);
    resetDocument();

    renderInApp(() => <Appearance />);
    const themes = await screen.findByRole("radiogroup", { name: "Theme" });
    const label = other === "light" ? "Light" : "Dark";
    expect(within(themes).getByRole("radio", { name: label }).getAttribute("aria-checked")).toBe(
      "true",
    );
    await waitFor(() => expect(shownScheme()).toEqual([other]));
  });
});
