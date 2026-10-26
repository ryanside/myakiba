import { afterAll, afterEach, expect, test } from "bun:test";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import * as z from "zod";
import type { User } from "@/lib/auth-client";

const user = {
  id: "collector",
  name: "collector",
  username: "collector",
  email: "collector@example.com",
  emailVerified: true,
  currency: "USD",
  dateFormat: "MM/DD/YYYY",
  hasSeenOnboarding: true,
  banned: false,
  createdAt: new Date(),
  updatedAt: new Date(),
} satisfies User;

const savedChanges: unknown[] = [];

const realFetch = globalThis.fetch;
globalThis.fetch = Object.assign(
  async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    const { pathname } = new URL(request.url);
    if (pathname.endsWith("/is-username-available")) {
      const { username } = z.object({ username: z.string() }).parse(await request.json());
      return Response.json({ available: username !== "taken.name" });
    }
    if (pathname.endsWith("/update-user")) {
      savedChanges.push(await request.json());
      return Response.json({ status: true });
    }
    if (pathname.endsWith("/get-session")) return Response.json(null);
    throw new Error(`Unexpected ${request.url}`);
  },
  { preconnect: realFetch.preconnect },
);

const { Profile } = await import("./profile");
const { Toaster } = await import("@/components/ui/toast");

afterEach(() => {
  cleanup();
  savedChanges.length = 0;
});
afterAll(() => {
  globalThis.fetch = realFetch;
});

function renderProfile() {
  const router = createRouter({
    routeTree: createRootRoute({ component: () => <Profile user={user} /> }),
    history: createMemoryHistory({ initialEntries: ["/settings"] }),
  });
  render(
    <QueryClientProvider client={new QueryClient()}>
      <Toaster>
        <RouterProvider router={router} />
      </Toaster>
    </QueryClientProvider>,
  );
}

async function typeUsername(username: string) {
  const field = await screen.findByLabelText("Username");
  fireEvent.change(field, { target: { value: username } });
}

test("a taken username says so and is not saved", async () => {
  renderProfile();
  await typeUsername("taken.name");

  expect(await screen.findByText("Taken")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

  expect(document.activeElement).toBe(screen.getByLabelText("Username"));
  expect(savedChanges).toEqual([]);
});

test("an available username saves and says so", async () => {
  renderProfile();
  await typeUsername("New.Name");

  expect(await screen.findByText("Available")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

  expect(await screen.findByText("Profile updated successfully")).toBeTruthy();
  await waitFor(() => expect(savedChanges).toEqual([{ username: "new.name" }]));
});
