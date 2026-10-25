import { afterEach, expect, test } from "bun:test";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { useState } from "react";
import { SettingsContent } from "./settings-content";
import type { SettingsSectionId } from "./settings-registry";

const { checkVisibility } = Element.prototype;

afterEach(() => {
  cleanup();
  Element.prototype.checkVisibility = checkVisibility;
});

/**
 * Settings with the nav beside the open section, as on a desktop. On a phone they are
 * separate screens, so opening a section hides the nav and showing the list hides the section.
 */
function SettingsScreen({ layout }: { readonly layout: "phone" | "desktop" }) {
  const [selected, setSelected] = useState<SettingsSectionId>();
  const section = selected ?? "preferences";
  const isPhone = layout === "phone";
  return (
    <>
      <nav style={isPhone && selected ? { display: "none" } : undefined}>
        <button type="button" onClick={() => setSelected("preferences")}>
          Preferences
        </button>
        <button type="button" onClick={() => setSelected("appearance")}>
          Appearance
        </button>
      </nav>
      <div style={isPhone && !selected ? { display: "none" } : undefined}>
        <SettingsContent key={section} section={section}>
          <p>{section} rows</p>
        </SettingsContent>
      </div>
    </>
  );
}

/** Opens Settings, then focuses a nav item and selects it. */
async function openSection(layout: "phone" | "desktop", name: string) {
  const root = createRootRoute({ component: () => <SettingsScreen layout={layout} /> });
  const router = createRouter({
    routeTree: root,
    history: createMemoryHistory({ initialEntries: ["/settings"] }),
  });
  render(<RouterProvider router={router} />);
  const navItem = await screen.findByRole("button", { name });
  navItem.focus();
  fireEvent.click(navItem);
  return navItem;
}

test("opening a section beside the nav leaves focus on the nav", async () => {
  const navItem = await openSection("desktop", "Appearance");

  expect(screen.getByText("appearance rows")).toBeTruthy();
  expect(document.activeElement).toBe(navItem);
});

test("a browser without checkVisibility still opens a section", async () => {
  Reflect.deleteProperty(Element.prototype, "checkVisibility");
  const navItem = await openSection("desktop", "Appearance");

  expect(screen.getByText("appearance rows")).toBeTruthy();
  expect(document.activeElement).toBe(navItem);
});
