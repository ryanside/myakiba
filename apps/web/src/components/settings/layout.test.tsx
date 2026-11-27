import { afterEach, expect, test } from "bun:test";
import { cleanup, render, waitFor } from "@testing-library/react";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { Layout } from "./layout";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

function viewChoices(name: string) {
  const group = document.querySelector(`[aria-label="${name}"]`);
  return [...(group?.querySelectorAll("[aria-pressed]") ?? [])].map((button) => [
    button.textContent,
    button.getAttribute("aria-pressed"),
  ]);
}

test("Settings offers Collection a single table view and shows a stored Compact view as Table", async () => {
  localStorage.setItem("collection:viewMode", JSON.stringify("compact"));
  localStorage.setItem("orders:viewMode", JSON.stringify("compact"));
  const router = createRouter({
    routeTree: createRootRoute({ component: Layout }),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  render(<RouterProvider router={router} />);

  await waitFor(() => expect(viewChoices("Collection view")).toHaveLength(3));
  expect(viewChoices("Collection view")).toEqual([
    ["Table", "true"],
    ["Grid", "false"],
    ["Gallery", "false"],
  ]);
  expect(viewChoices("Orders view")).toEqual([
    ["Compact", "true"],
    ["Table", "false"],
    ["Grid", "false"],
    ["Gallery", "false"],
  ]);
});
