import { afterEach, expect, test } from "bun:test";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { ThemeProvider } from "next-themes";
import { Appearance } from "./appearance";

afterEach(() => {
  cleanup();
  localStorage.removeItem("theme");
  delete document.documentElement.dataset.theme;
  document.documentElement.style.colorScheme = "";
});

function renderAppearance() {
  const router = createRouter({
    routeTree: createRootRoute({ component: Appearance }),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  render(
    <ThemeProvider>
      <RouterProvider router={router} />
    </ThemeProvider>,
  );
}

test.each([
  { name: "Light", value: "light", initial: "dark" },
  { name: "Dark", value: "dark", initial: "light" },
  { name: "System", value: "system", initial: "dark" },
])(
  "Settings offers the $name theme and choosing it sets the theme",
  async ({ name, value, initial }) => {
    localStorage.setItem("theme", initial);
    renderAppearance();

    const group = await screen.findByRole("radiogroup", { name: "Theme" });
    expect([...group.querySelectorAll('[role="radio"]')].map((radio) => radio.textContent)).toEqual(
      ["Light", "Dark", "System"],
    );
    const radio = screen.getByRole("radio", { name });
    expect(radio.getAttribute("aria-checked")).toBe("false");

    fireEvent.click(radio);

    expect(radio.getAttribute("aria-checked")).toBe("true");
    expect(localStorage.getItem("theme")).toBe(value);
  },
);

test("the Reduce motion setting says it keeps fades and drops movement", async () => {
  renderAppearance();

  expect(await screen.findByText("Replace movement with simple fades.")).toBeDefined();
});

test("the Page backgrounds switch is on in a browser with no saved preference", async () => {
  renderAppearance();

  const toggle = await screen.findByRole("switch", { name: "Page backgrounds" });
  expect(toggle.getAttribute("aria-checked")).toBe("true");
});
