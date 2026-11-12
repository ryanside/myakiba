import { afterEach, expect, mock, test } from "bun:test";
import { cleanup, configure, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { Toaster } from "@/components/ui/toast";
import { answerAuth, refuse, resetAuthAnswers, type } from "../../../test/better-auth";
import { PassingTurnstile } from "../../../test/turnstile";

configure({ asyncUtilTimeout: 3000 });

await mock.module("@marsidev/react-turnstile", () => ({ Turnstile: PassingTurnstile }));
type Navigation = { readonly to: string; readonly search?: Record<string, string> };
const navigations: Navigation[] = [];
const realRouter = await import("@tanstack/react-router");
await mock.module("@tanstack/react-router", () => ({
  ...realRouter,
  Link: ({ children }: { readonly children: ReactNode }) => <a href="/">{children}</a>,
  useNavigate: () => async (navigation: Navigation) => {
    navigations.push(navigation);
  },
}));
const { Route: ForgotPassword } = await import("@/routes/(auth)/forgot-password");
const { Route: ResetPassword } = await import("@/routes/(auth)/reset-password");

afterEach(() => {
  cleanup();
  resetAuthAnswers();
  navigations.length = 0;
});

function renderPage(page: typeof ForgotPassword | typeof ResetPassword) {
  const Page = page.options.component;
  if (!Page) throw new Error("The route has no component");
  render(
    <Toaster>
      <Page />
    </Toaster>,
  );
}

function requestReset() {
  window.location.href = "http://localhost:3001/forgot-password";
  renderPage(ForgotPassword);
  type("Email", "collector@example.com");
  fireEvent.click(screen.getByRole("button", { name: "Send Reset Link" }));
}

function resetPassword() {
  window.location.href = "http://localhost:3001/reset-password?token=reset-token";
  renderPage(ResetPassword);
  type("New Password", "correct horse");
  type("Confirm Password", "correct horse");
  fireEvent.click(screen.getByRole("button", { name: "Reset Password" }));
}

test("a reset link request says where the link went", async () => {
  answerAuth(() => Response.json({ status: true }));

  requestReset();

  expect(await screen.findByText("Check your email")).toBeTruthy();
  expect(screen.getByText("collector@example.com")).toBeTruthy();
});

test("a refused reset link request shows the server's text", async () => {
  answerAuth(() => refuse(429, "Too Many Requests", { message: "Too many requests" }));

  requestReset();

  expect(await screen.findByText("Too many requests")).toBeTruthy();
  expect(screen.queryByText("Check your email")).toBeNull();
});

test("a reset link request refused without a message shows the page's own text", async () => {
  answerAuth(() => refuse(500, "Internal Server Error"));

  requestReset();

  expect(await screen.findByText("Failed to send password reset email")).toBeTruthy();
});

test("a password reset goes to login", async () => {
  const requests = answerAuth(() => Response.json({ status: true }));

  resetPassword();

  expect(await screen.findByText("Password reset successfully")).toBeTruthy();
  expect(navigations).toEqual([{ to: "/login" }]);
  expect(requests).toEqual([
    { path: "/reset-password", body: { newPassword: "correct horse", token: "reset-token" } },
  ]);
});

test("a refused password reset shows the server's text and stays", async () => {
  answerAuth(() => refuse(400, "Bad Request", { code: "INVALID_TOKEN", message: "Invalid token" }));

  resetPassword();

  expect(await screen.findByText("Invalid token")).toBeTruthy();
  expect(navigations).toEqual([]);
});

test("a password reset refused without a message shows the page's own text", async () => {
  answerAuth(() => refuse(500, "Internal Server Error"));

  resetPassword();

  await waitFor(() => expect(screen.getByText("Failed to reset password")).toBeTruthy());
});

for (const [name, submit] of [
  ["reset link request", requestReset],
  ["password reset", resetPassword],
] as const) {
  test(`a network failure during ${name} shows safe feedback and stays`, async () => {
    answerAuth(() => {
      throw new TypeError("Failed to fetch");
    });
    submit();
    expect(
      await screen.findByText("Couldn't connect. Check your connection and try again."),
    ).toBeTruthy();
    expect(navigations).toEqual([]);
  });
}
