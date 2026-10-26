import { afterEach, expect, spyOn, test } from "bun:test";
import {
  cleanup,
  configure,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import type { ReactNode } from "react";
import * as z from "zod";
import { Toaster } from "@/components/ui/toast";
import type { User } from "@/lib/auth-client";
import { answerAuth, refuse, resetAuthAnswers, type } from "../../../test/better-auth";
import type { AuthRequest } from "../../../test/better-auth";

configure({ asyncUtilTimeout: 3000 });

const { Account } = await import("./account");
const { Preferences } = await import("./preferences");
const { Profile } = await import("./profile");

let invalidations = 0;

afterEach(() => {
  cleanup();
  resetAuthAnswers();
  invalidations = 0;
});

const user = {
  id: "settings-user",
  name: "Collector",
  username: "collector",
  email: "collector@example.com",
  emailVerified: true,
  currency: "USD",
  dateFormat: "MM/DD/YYYY",
  hasSeenOnboarding: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  banned: false,
  role: "user",
} satisfies User;

/** Renders a settings screen on the Settings route, counting route data reloads. */
function renderSettings(settings: () => ReactNode) {
  const root = createRootRoute();
  const app = createRoute({ getParentRoute: () => root, id: "(app)" });
  const route = createRoute({
    getParentRoute: () => app,
    path: "settings",
    validateSearch: z.object({ error: z.string().optional() }),
    component: settings,
  });
  const router = createRouter({
    routeTree: root.addChildren([app.addChildren([route])]),
    history: createMemoryHistory({ initialEntries: ["/settings"] }),
  });
  spyOn(router, "invalidate").mockImplementation(async () => {
    invalidations += 1;
  });
  render(
    <QueryClientProvider client={new QueryClient()}>
      <Toaster>
        <RouterProvider router={router} />
      </Toaster>
    </QueryClientProvider>,
  );
}

/** Answers the reads the settings screens make, and every write with `answer`. */
function serve(answer: (request: AuthRequest) => Response) {
  return answerAuth((request) => {
    if (request.path.endsWith("/account-type"))
      return Response.json({ hasCredentialAccount: true });
    if (request.path === "/is-username-available") return Response.json({ available: true });
    if (request.path === "/list-accounts") return Response.json([]);
    if (request.path === "/list-sessions") return Response.json([]);
    if (request.path === "/get-session") return Response.json(null);
    return answer(request);
  });
}

async function changePassword() {
  renderSettings(() => <Account user={user} />);
  const trigger = await waitFor(() => {
    const button = screen.getByRole("button", { name: "Change password" });
    expect(button.hasAttribute("disabled")).toBe(false);
    return button;
  });
  fireEvent.click(trigger);
  const dialog = await screen.findByRole("dialog");
  for (const [label, value] of [
    ["Current password", "old password"],
    ["New password", "new password"],
    ["Confirm new password", "new password"],
  ] as const) {
    fireEvent.change(within(dialog).getByLabelText(label), { target: { value } });
  }
  fireEvent.click(within(dialog).getByRole("button", { name: "Change password" }));
}

async function savePreferences() {
  renderSettings(() => <Preferences user={user} />);
  fireEvent.click(await screen.findByRole("button", { name: "DD/MM/YYYY" }));
  fireEvent.click(screen.getByRole("button", { name: "Save preferences" }));
}

async function saveProfile() {
  renderSettings(() => <Profile user={user} />);
  await screen.findByLabelText("Username");
  type("Username", "new_name");
  await screen.findByText("Available");
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
}

test("a changed password says so and closes the dialog", async () => {
  const requests = serve(() => Response.json({ token: null, user }));

  await changePassword();

  expect(await screen.findByText("Password changed")).toBeTruthy();
  await waitFor(() => expect(document.querySelector('[data-slot="dialog-content"]')).toBeNull());
  expect(requests.find(({ path }) => path === "/change-password")?.body).toEqual({
    currentPassword: "old password",
    newPassword: "new password",
    revokeOtherSessions: true,
  });
});

test("a refused password change shows the server's text and keeps the dialog open", async () => {
  serve(() =>
    refuse(400, "Bad Request", { code: "INVALID_PASSWORD", message: "Invalid password" }),
  );

  await changePassword();

  expect(await screen.findByText("Invalid password")).toBeTruthy();
  expect(within(screen.getByRole("dialog")).getByLabelText("Current password")).toHaveProperty(
    "value",
    "old password",
  );
});

test("a password change refused without a message shows the form's own text", async () => {
  serve(() => refuse(500, "Internal Server Error"));

  await changePassword();

  expect(await screen.findByText("Couldn't change your password")).toBeTruthy();
});

test("saved preferences say so and reload the route data", async () => {
  const requests = serve(() => Response.json({ status: true }));

  await savePreferences();

  expect(await screen.findByText("Preferences updated successfully")).toBeTruthy();
  expect(invalidations).toBe(1);
  expect(requests.filter(({ path }) => path === "/update-user")).toEqual([
    { path: "/update-user", body: { dateFormat: "DD/MM/YYYY" } },
  ]);
});

test("refused preferences show the server's text", async () => {
  serve(() => refuse(400, "Bad Request", { message: "Unsupported currency" }));

  await savePreferences();

  expect(await screen.findByText("Unsupported currency")).toBeTruthy();
  expect(invalidations).toBe(0);
});

test("preferences refused without a message show the form's own text", async () => {
  serve(() => refuse(500, "Internal Server Error"));

  await savePreferences();

  expect(await screen.findByText("Failed to update preferences")).toBeTruthy();
});

test("a saved profile says so and reloads the route data", async () => {
  serve(() => Response.json({ status: true }));

  await saveProfile();

  expect(await screen.findByText("Profile updated successfully")).toBeTruthy();
  expect(invalidations).toBe(1);
});

test("a refused profile shows the server's text", async () => {
  serve(() =>
    refuse(400, "Bad Request", { code: "USERNAME_IS_ALREADY_TAKEN", message: "Username taken" }),
  );

  await saveProfile();

  expect(await screen.findByText("Username taken")).toBeTruthy();
  expect(invalidations).toBe(0);
});

test("a profile refused without a message shows the form's own text", async () => {
  serve(() => refuse(500, "Internal Server Error"));

  await saveProfile();

  expect(await screen.findByText("Failed to update profile")).toBeTruthy();
});

test("a taken username says so in the profile", async () => {
  answerAuth(() => Response.json({ available: false }));
  renderSettings(() => <Profile user={user} />);
  await screen.findByLabelText("Username");

  type("Username", "taken");

  expect(await screen.findByText("Taken")).toBeTruthy();
});

test("a username check the server refuses shows its text in the profile", async () => {
  answerAuth(() => refuse(422, "Unprocessable Entity", { message: "Username is invalid" }));
  renderSettings(() => <Profile user={user} />);
  await screen.findByLabelText("Username");

  type("Username", "refused");

  expect(await screen.findByText("Username is invalid")).toBeTruthy();
});

test.each([
  ["profile", saveProfile],
  ["preferences", savePreferences],
  ["password change", changePassword],
] as const)(
  "a network failure during %s shows safe feedback without advancing",
  async (name, submit) => {
    serve(() => {
      throw new TypeError("Failed to fetch");
    });
    if (name === "profile") {
      // The profile saves only a username the server called available.
      answerAuth((request) => {
        if (request.path === "/is-username-available") return Response.json({ available: true });
        throw new TypeError("Failed to fetch");
      });
    }
    await submit();
    expect(
      await screen.findByText("Couldn't connect. Check your connection and try again."),
    ).toBeTruthy();
    expect(invalidations).toBe(0);
  },
);

test("a network failure checking a profile username shows safe feedback", async () => {
  answerAuth(() => {
    throw new TypeError("Failed to fetch");
  });
  renderSettings(() => <Profile user={user} />);
  await screen.findByLabelText("Username");
  type("Username", "collector2");
  expect(
    await screen.findByText("Couldn't connect. Check your connection and try again."),
  ).toBeTruthy();
});
