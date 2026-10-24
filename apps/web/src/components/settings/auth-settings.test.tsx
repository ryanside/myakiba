import { afterEach, expect, mock, test } from "bun:test";
import { cleanup, configure, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Toaster } from "@/components/ui/toast";
import type { User } from "@/lib/auth-client";
import { answerAuth, refuse, resetAuthAnswers, type } from "../../../test/better-auth";
import type { AuthRequest } from "../../../test/better-auth";

configure({ asyncUtilTimeout: 3000 });

let invalidations = 0;
const realRouter = await import("@tanstack/react-router");
await mock.module("@tanstack/react-router", () => ({
  ...realRouter,
  useRouter: () => ({
    invalidate: async () => {
      invalidations += 1;
    },
  }),
}));
const { Account } = await import("./account");
const { Preferences } = await import("./preferences");
const { Profile } = await import("./profile");

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
  createdAt: new Date(),
  updatedAt: new Date(),
  banned: false,
  role: "user",
} satisfies User;

function renderSettings(settings: ReactNode) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <Toaster>{settings}</Toaster>
    </QueryClientProvider>,
  );
}

function serve(answer: (request: AuthRequest) => Response) {
  return answerAuth((request) => {
    if (request.path.endsWith("/account-type"))
      return Response.json({ hasCredentialAccount: true });
    if (request.path === "/is-username-available") return Response.json({ available: true });
    return answer(request);
  });
}

async function changePassword() {
  renderSettings(<Account />);
  await waitFor(() =>
    expect(screen.getByLabelText("Current password")).not.toHaveProperty("disabled", true),
  );
  type("Current password", "old password");
  type("New password", "new password");
  type("Confirm new password", "new password");
  fireEvent.click(screen.getByRole("button", { name: "Update password" }));
}

function savePreferences() {
  renderSettings(<Preferences user={user} />);
  fireEvent.click(screen.getByRole("button", { name: "DD/MM/YYYY" }));
  fireEvent.click(screen.getByRole("button", { name: "Save preferences" }));
}

function saveProfile() {
  renderSettings(<Profile user={user} />);
  type("Username", "new-name");
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
}

test("a changed password says so and clears the form", async () => {
  const requests = serve(() => Response.json({ token: null, user }));

  await changePassword();

  expect(await screen.findByText("Password changed successfully")).toBeTruthy();
  expect(screen.getByLabelText("Current password")).toHaveProperty("value", "");
  expect(requests.find(({ path }) => path === "/change-password")?.body).toEqual({
    newPassword: "new password",
    currentPassword: "old password",
    revokeOtherSessions: true,
  });
});

test("a refused password change shows the server's text", async () => {
  serve(() =>
    refuse(400, "Bad Request", { code: "INVALID_PASSWORD", message: "Invalid password" }),
  );

  await changePassword();

  expect(await screen.findByText("Invalid password")).toBeTruthy();
  expect(screen.getByLabelText("Current password")).toHaveProperty("value", "old password");
});

test("a password change refused without a message shows the form's own text", async () => {
  serve(() => refuse(500, "Internal Server Error"));

  await changePassword();

  expect(await screen.findByText("Failed to change password")).toBeTruthy();
});

test("saved preferences say so and reload the route data", async () => {
  const requests = serve(() => Response.json({ status: true }));

  savePreferences();

  expect(await screen.findByText("Preferences updated successfully")).toBeTruthy();
  expect(invalidations).toBe(1);
  expect(requests).toEqual([
    { path: "/update-user", body: { currency: "USD", dateFormat: "DD/MM/YYYY" } },
  ]);
});

test("refused preferences show the server's text", async () => {
  serve(() => refuse(400, "Bad Request", { message: "Unsupported currency" }));

  savePreferences();

  expect(await screen.findByText("Unsupported currency")).toBeTruthy();
  expect(invalidations).toBe(0);
});

test("preferences refused without a message show the form's own text", async () => {
  serve(() => refuse(500, "Internal Server Error"));

  savePreferences();

  expect(await screen.findByText("Failed to update preferences")).toBeTruthy();
});

test("a saved profile says so and reloads the route data", async () => {
  serve(() => Response.json({ status: true }));

  saveProfile();

  expect(await screen.findByText("Profile updated successfully")).toBeTruthy();
  expect(invalidations).toBe(1);
});

test("a refused profile shows the server's text", async () => {
  serve(() =>
    refuse(400, "Bad Request", { code: "USERNAME_IS_ALREADY_TAKEN", message: "Username taken" }),
  );

  saveProfile();

  expect(await screen.findByText("Username taken")).toBeTruthy();
  expect(invalidations).toBe(0);
});

test("a profile refused without a message shows the form's own text", async () => {
  serve(() => refuse(500, "Internal Server Error"));

  saveProfile();

  expect(await screen.findByText("Failed to update profile")).toBeTruthy();
});

test("a taken username says so in the profile", async () => {
  answerAuth(() => Response.json({ available: false }));
  renderSettings(<Profile user={user} />);

  type("Username", "taken");

  expect(await screen.findByText("Username is already taken")).toBeTruthy();
});

test("a username check the server refuses shows its text in the profile", async () => {
  answerAuth(() => refuse(422, "Unprocessable Entity", { message: "Username is invalid" }));
  renderSettings(<Profile user={user} />);

  type("Username", "bad name");

  expect(await screen.findByText("Username is invalid")).toBeTruthy();
});

test.each([
  ["profile", saveProfile],
  ["preferences", savePreferences],
  ["password change", changePassword],
] as const)(
  "a network failure during %s shows safe feedback without advancing",
  async (_name, submit) => {
    serve(() => {
      throw new TypeError("Failed to fetch");
    });
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
  renderSettings(<Profile user={user} />);
  type("Username", "collector2");
  expect(
    await screen.findByText("Couldn't connect. Check your connection and try again."),
  ).toBeTruthy();
});
