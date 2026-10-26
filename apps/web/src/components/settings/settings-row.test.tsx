import { afterEach, expect, test } from "bun:test";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import type { ReactNode } from "react";
import { settingAnchor } from "./settings-registry";
import { SettingsRow } from "./settings-row";

afterEach(cleanup);

function renderAt(location: string, content: () => ReactNode) {
  const router = createRouter({
    routeTree: createRootRoute({ component: content }),
    history: createMemoryHistory({ initialEntries: [location] }),
  });
  render(<RouterProvider router={router} />);
}

function PasswordRowBesideAPasswordField() {
  return (
    <>
      <SettingsRow setting="password">
        <span>Change password</span>
      </SettingsRow>
      <label htmlFor="password">Password</label>
      <input id="password" type="password" />
    </>
  );
}

// A duplicate id makes browsers point the label at the row, which leaves the field unnamed.
test("a setting row never takes the id of a form field with the same name", async () => {
  renderAt("/settings", PasswordRowBesideAPasswordField);
  await screen.findByLabelText("Password");

  expect([...document.querySelectorAll('[id="password"]')].map((node) => node.tagName)).toEqual([
    "INPUT",
  ]);
});

test("a link to a setting focuses and marks its row", async () => {
  renderAt(`/settings#${settingAnchor("password")}`, PasswordRowBesideAPasswordField);

  const description = await screen.findByText("Sign in with your email and a password.");
  const row = description.closest("[data-target]");
  expect(row).not.toBeNull();
  await waitFor(() => expect(document.activeElement).toBe(row));
});
