import { afterEach, expect, mock, spyOn, test } from "bun:test";
import { cleanup, configure, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { Toaster } from "@/components/ui/toast";
import { answerAuth, refuse, resetAuthAnswers, type } from "../../../test/better-auth";
import type { AuthRequest } from "../../../test/better-auth";

configure({ asyncUtilTimeout: 3000 });

await mock.module("@marsidev/react-turnstile", () => ({ Turnstile: () => null }));
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
const { default: SignInForm } = await import("./sign-in-form");
const { default: SignUpForm } = await import("./sign-up-form");

window.location.href = "http://localhost:3001/login";

afterEach(() => {
  cleanup();
  resetAuthAnswers();
  navigations.length = 0;
});

const user = {
  id: "user-1",
  name: "collector",
  username: "collector",
  email: "collector@example.com",
  emailVerified: true,
  image: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function serve(answer: (request: AuthRequest) => Response) {
  return answerAuth((request) =>
    request.path === "/get-session" ? Response.json(null) : answer(request),
  );
}

function signIn() {
  render(
    <Toaster>
      <SignInForm redirectTo="/dashboard" />
    </Toaster>,
  );
  type("Email", "collector@example.com");
  type("Password", "correct horse");
  fireEvent.click(screen.getByRole("button", { name: "Login" }));
}

function signUp() {
  render(
    <Toaster>
      <SignUpForm />
    </Toaster>,
  );
  type("Username", "collector");
  type("Email", "collector@example.com");
  type("Password", "correct horse");
  fireEvent.click(screen.getByRole("button", { name: "Register" }));
}

test("a sign-in goes to the page it was headed for", async () => {
  const assign = spyOn(window.location, "assign").mockImplementation(() => {});
  serve(() => Response.json({ redirect: false, token: "token", user }));

  signIn();

  try {
    await waitFor(() => expect(assign).toHaveBeenCalledWith("http://localhost:3001/dashboard"));
  } finally {
    assign.mockRestore();
  }
});

test("a sign-in with an unverified email asks to verify it instead of the server's text", async () => {
  serve(() =>
    refuse(403, "Forbidden", { code: "EMAIL_NOT_VERIFIED", message: "Email not verified" }),
  );

  signIn();

  expect(
    await screen.findByText(
      "Please verify your email address. Check your inbox for a verification email.",
    ),
  ).toBeTruthy();
  expect(screen.queryByText("Email not verified")).toBeNull();
});

test("a refused sign-in shows the server's text", async () => {
  serve(() =>
    refuse(401, "Unauthorized", {
      code: "INVALID_EMAIL_OR_PASSWORD",
      message: "Invalid email or password",
    }),
  );

  signIn();

  expect(await screen.findByText("Invalid email or password")).toBeTruthy();
});

test("a sign-in refused without a message shows the status text", async () => {
  serve(() => refuse(429, "Too Many Requests"));

  signIn();

  expect(await screen.findByText("Too Many Requests")).toBeTruthy();
});

test("a sign-up asks to verify the email", async () => {
  const requests = serve(() => Response.json({ token: null, user }));

  signUp();

  await waitFor(() =>
    expect(navigations).toEqual([
      { to: "/login", search: { view: "verify-email", email: "collector@example.com" } },
    ]),
  );
  expect(requests.map(({ path }) => path)).toContain("/sign-up/email");
});

test("a refused sign-up shows the server's text", async () => {
  serve(({ path }) =>
    path === "/sign-up/email"
      ? refuse(422, "Unprocessable Entity", {
          code: "USER_ALREADY_EXISTS",
          message: "User already exists. Use another email.",
        })
      : Response.json({ available: true }),
  );

  signUp();

  expect(await screen.findByText("User already exists. Use another email.")).toBeTruthy();
  expect(navigations).toEqual([]);
});

test("a sign-up refused without a message shows the status text", async () => {
  serve(({ path }) =>
    path === "/sign-up/email"
      ? refuse(500, "Internal Server Error")
      : Response.json({ available: true }),
  );

  signUp();

  expect(await screen.findByText("Internal Server Error")).toBeTruthy();
});

test("a taken username says so while signing up", async () => {
  serve(() => Response.json({ available: false }));
  render(<SignUpForm />);

  type("Username", "taken");

  expect(await screen.findByText("Username is already taken")).toBeTruthy();
});

test("a username check the server refuses shows its text while signing up", async () => {
  serve(() => refuse(422, "Unprocessable Entity", { message: "Username is invalid" }));
  render(<SignUpForm />);

  type("Username", "bad name");

  expect(await screen.findByText("Username is invalid")).toBeTruthy();
});

test("a Google sign-up the server refuses shows its text", async () => {
  serve(() => refuse(503, "Service Unavailable", { message: "Google sign-in is unavailable" }));
  render(
    <Toaster>
      <SignUpForm />
    </Toaster>,
  );

  fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));

  expect(await screen.findByText("Google sign-in is unavailable")).toBeTruthy();
});

test("a Google sign-in refused without a message shows the status text", async () => {
  serve(() => refuse(503, "Service Unavailable"));
  render(
    <Toaster>
      <SignInForm redirectTo="/dashboard" />
    </Toaster>,
  );

  fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));

  expect(await screen.findByText("Service Unavailable")).toBeTruthy();
});

for (const [name, submit] of [
  ["sign-in", signIn],
  ["sign-up", signUp],
] as const) {
  test(`a network failure during email ${name} shows safe feedback`, async () => {
    serve(({ path }) => {
      if (path === "/is-username-available") return Response.json({ available: true });
      throw new TypeError("Failed to fetch");
    });
    submit();
    expect(
      await screen.findByText("Couldn't connect. Check your connection and try again."),
    ).toBeTruthy();
    expect(navigations).toEqual([]);
  });
}
