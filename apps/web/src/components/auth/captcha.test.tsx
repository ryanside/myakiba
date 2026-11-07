import { afterAll, afterEach, expect, jest, mock, test } from "bun:test";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { TurnstileProps } from "@marsidev/react-turnstile";
import { useEffect } from "react";
import {
  createMemoryHistory,
  createRootRouteWithContext,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import type { RouteComponent } from "@tanstack/react-router";
import { Toaster } from "@/components/ui/toast";
import type { RouterAppContext } from "@/routes/__root";

let widget: TurnstileProps | undefined;

function FakeTurnstile(props: TurnstileProps) {
  useEffect(() => {
    widget = props;
  });
  return null;
}

await mock.module("@marsidev/react-turnstile", () => ({ Turnstile: FakeTurnstile }));

const cloudflare = {
  pass: (token: string) => act(() => widget?.onSuccess?.(token)),
  expire: () => act(() => widget?.onExpire?.("expired")),
  fail: () => act(() => widget?.onError?.("300010")),
  blockScript: () => act(() => widget?.scriptOptions?.onError?.()),
  askForClick: () => act(() => widget?.onBeforeInteractive?.()),
  finishClick: () => act(() => widget?.onAfterInteractive?.()),
  timeOutClick: () => act(() => widget?.onTimeout?.()),
};

type Sent = { readonly path: string; readonly captcha: string | null };
const sent: Sent[] = [];
let signInReply = () => Response.json({ message: "Invalid email or password" }, { status: 401 });
const initialURL = window.location.href;
const realFetch = globalThis.fetch;
globalThis.fetch = Object.assign(
  async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    const path = new URL(request.url).pathname;
    if (path.endsWith("/is-username-available")) return Response.json({ available: true });
    sent.push({ path, captcha: request.headers.get("x-captcha-response") });
    if (path.endsWith("/sign-in/email")) return signInReply();
    return Response.json({ status: true });
  },
  { preconnect: realFetch.preconnect },
);

const { default: SignInForm } = await import("./sign-in-form");
const { default: SignUpForm } = await import("./sign-up-form");
const { Route: forgotPasswordRoute } = await import("@/routes/(auth)/forgot-password");

afterEach(() => {
  jest.useRealTimers();
  cleanup();
  window.location.href = initialURL;
  sent.length = 0;
  widget = undefined;
  signInReply = () => Response.json({ message: "Invalid email or password" }, { status: 401 });
});
afterAll(() => {
  globalThis.fetch = realFetch;
});

function renderAt(path: string, Screen: RouteComponent) {
  window.location.href = `http://localhost:3001${path}`;
  const root = createRootRouteWithContext<RouterAppContext>()({ component: Outlet });
  const page = createRoute({ getParentRoute: () => root, path, component: Screen });
  const others = ["/login", "/signup", "/forgot-password", "/dashboard"]
    .filter((other) => other !== path)
    .map((other) =>
      createRoute({ getParentRoute: () => root, path: other, component: () => null }),
    );
  const router = createRouter({
    routeTree: root.addChildren([page, ...others]),
    history: createMemoryHistory({ initialEntries: [path] }),
    context: { readSession: async () => ({ session: null, unavailable: false }) },
    defaultPendingMinMs: 0,
  });
  render(
    <Toaster>
      <RouterProvider router={router} />
    </Toaster>,
  );
}

function type(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

async function openSignIn() {
  renderAt("/login", () => <SignInForm redirectTo="/dashboard" />);
  await screen.findByRole("button", { name: "Sign in" });
  type("Email", "ada@example.com");
  type("Password", "correct horse");
}

const submitSignIn = () => fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

function expectNoCaptchaJargon() {
  expect(screen.queryByText(/captcha/i)).toBeNull();
}

test("submitting before Cloudflare answers waits, then signs in with the token", async () => {
  await openSignIn();
  submitSignIn();

  expect(await screen.findByText("Checking your browser…")).toBeDefined();
  expect(sent).toEqual([]);
  expectNoCaptchaJargon();

  await cloudflare.pass("token-1");
  await waitFor(() =>
    expect(sent).toEqual([{ path: "/api/auth/sign-in/email", captcha: "token-1" }]),
  );
  expect(screen.queryByText("Checking your browser…")).toBeNull();
});

test("an expired token is never sent; the refreshed one is", async () => {
  await openSignIn();
  await cloudflare.pass("stale");
  await cloudflare.expire();
  submitSignIn();

  expect(await screen.findByText("Checking your browser…")).toBeDefined();
  expect(sent).toEqual([]);

  await cloudflare.pass("fresh");
  await waitFor(() =>
    expect(sent).toEqual([{ path: "/api/auth/sign-in/email", captcha: "fresh" }]),
  );
});

test("a second try after a wrong password waits for a fresh token instead of reusing the spent one", async () => {
  await openSignIn();
  await cloudflare.pass("first");
  submitSignIn();
  expect(await screen.findByText("Invalid email or password")).toBeDefined();

  fireEvent.click(await screen.findByRole("button", { name: "Sign in" }));
  expect(await screen.findByText("Checking your browser…")).toBeDefined();
  expect(sent.map((request) => request.captcha)).toEqual(["first"]);

  await cloudflare.pass("second");
  await waitFor(() => expect(sent.map((request) => request.captcha)).toEqual(["first", "second"]));
});

test("a waiting submit continues once the user completes Cloudflare's challenge", async () => {
  await openSignIn();
  submitSignIn();
  await cloudflare.askForClick();

  expect(await screen.findByText("Complete the check above to continue.")).toBeDefined();
  expect(sent).toEqual([]);

  await cloudflare.pass("clicked");
  await waitFor(() =>
    expect(sent).toEqual([{ path: "/api/auth/sign-in/email", captcha: "clicked" }]),
  );
});

test.each([
  ["a blocked Cloudflare script", cloudflare.blockScript],
  ["a widget error", cloudflare.fail],
])("%s says what happened and what to do, and sends nothing", async (_, breakWidget) => {
  await openSignIn();
  await breakWidget();

  const message = await screen.findByText(/couldn't run the browser check/i);
  expect(message.textContent).toMatch(/reload the page/i);
  expect(message.textContent).toMatch(/blocker/i);

  submitSignIn();
  await act(async () => {});
  expect(sent).toEqual([]);
  expectNoCaptchaJargon();
});

test("a check that never answers stops the waiting submit after 15 seconds and says what to do", async () => {
  jest.useFakeTimers();
  await openSignIn();
  submitSignIn();
  await act(async () => {});
  expect(screen.getByText("Checking your browser…")).toBeDefined();

  await act(async () => jest.advanceTimersByTime(14_000));
  expect(screen.queryByText(/couldn't run the browser check/i)).toBeNull();

  await act(async () => jest.advanceTimersByTime(1000));
  expect(screen.getByText(/couldn't run the browser check/i).textContent).toMatch(
    /reload the page/i,
  );
  expect(screen.queryByText("Checking your browser…")).toBeNull();
  expect(sent).toEqual([]);

  await cloudflare.pass("late");
  expect(screen.queryByText(/couldn't run the browser check/i)).toBeNull();
  expect(sent).toEqual([]);
  await act(async () => jest.advanceTimersByTime(1000));
  submitSignIn();
  await act(async () => {});
  expect(sent).toEqual([{ path: "/api/auth/sign-in/email", captcha: "late" }]);
});

test("the 15 second limit never cuts off a user looking at Cloudflare's checkbox", async () => {
  jest.useFakeTimers();
  await openSignIn();
  submitSignIn();
  await cloudflare.askForClick();

  await act(async () => jest.advanceTimersByTime(60_000));
  expect(screen.getByText("Complete the check above to continue.")).toBeDefined();
  expect(screen.queryByText(/couldn't run the browser check/i)).toBeNull();

  await cloudflare.pass("clicked");
  await act(async () => {});
  expect(sent).toEqual([{ path: "/api/auth/sign-in/email", captcha: "clicked" }]);
});

test("a renewed check gets its own 15 seconds", async () => {
  jest.useFakeTimers();
  await openSignIn();
  submitSignIn();
  await act(async () => jest.advanceTimersByTime(14_000));
  await cloudflare.pass("first");
  await act(async () => {});
  expect(screen.getByText("Invalid email or password")).toBeDefined();

  fireEvent.click(screen.getByRole("button", { name: /^Sign in/ }));
  await act(async () => {});
  expect(screen.getByText("Checking your browser…")).toBeDefined();
  await act(async () => jest.advanceTimersByTime(14_000));
  expect(screen.queryByText(/couldn't run the browser check/i)).toBeNull();

  await act(async () => jest.advanceTimersByTime(1000));
  expect(screen.getByText(/couldn't run the browser check/i).textContent).toMatch(
    /reload the page/i,
  );
  expect(sent.map((request) => request.captcha)).toEqual(["first"]);
});

test.each([
  ["after the checkbox is done", cloudflare.finishClick],
  ["after the checkbox times out", cloudflare.timeOutClick],
])("%s, a stalled check still fails after 15 seconds and says what to do", async (_, leave) => {
  jest.useFakeTimers();
  await openSignIn();
  submitSignIn();
  await cloudflare.askForClick();
  await act(async () => jest.advanceTimersByTime(60_000));

  await leave();
  expect(screen.getByText("Checking your browser…")).toBeDefined();
  await act(async () => jest.advanceTimersByTime(14_000));
  expect(screen.queryByText(/couldn't run the browser check/i)).toBeNull();

  await act(async () => jest.advanceTimersByTime(1000));
  expect(screen.getByText(/couldn't run the browser check/i).textContent).toMatch(
    /reload the page/i,
  );
  expect(sent).toEqual([]);
});

test("a checkbox that reports done after its token arrived still signs in with that token", async () => {
  await openSignIn();
  await cloudflare.askForClick();
  await cloudflare.pass("clicked");
  await cloudflare.finishClick();

  submitSignIn();
  await waitFor(() =>
    expect(sent).toEqual([{ path: "/api/auth/sign-in/email", captcha: "clicked" }]),
  );
});

test("a widget that recovers after an error clears the message and signs in", async () => {
  await openSignIn();
  await cloudflare.fail();
  expect(await screen.findByText(/couldn't run the browser check/i)).toBeDefined();

  await cloudflare.pass("retried");
  expect(screen.queryByText(/couldn't run the browser check/i)).toBeNull();
  submitSignIn();
  await waitFor(() =>
    expect(sent).toEqual([{ path: "/api/auth/sign-in/email", captcha: "retried" }]),
  );
});

test("sign up waits for the token instead of sending an empty one", async () => {
  renderAt("/signup", SignUpForm);
  await screen.findByRole("button", { name: "Register" });
  type("Username", "ada");
  type("Email", "ada@example.com");
  type("Password", "correct horse");
  fireEvent.click(screen.getByRole("button", { name: "Register" }));

  expect(await screen.findByText("Checking your browser…")).toBeDefined();
  expect(sent).toEqual([]);

  await cloudflare.pass("signup-token");
  await waitFor(() =>
    expect(sent).toEqual([{ path: "/api/auth/sign-up/email", captcha: "signup-token" }]),
  );
});

test("forgot password waits for the token instead of sending an empty one", async () => {
  const ForgotPassword = forgotPasswordRoute.options.component;
  if (!ForgotPassword) throw new Error("forgot-password has no component");
  renderAt("/forgot-password", ForgotPassword);
  await screen.findByRole("button", { name: "Send Reset Link" });
  type("Email", "ada@example.com");
  fireEvent.click(screen.getByRole("button", { name: "Send Reset Link" }));

  expect(await screen.findByText("Checking your browser…")).toBeDefined();
  expect(sent).toEqual([]);

  await cloudflare.pass("reset-token");
  await waitFor(() =>
    expect(sent).toEqual([{ path: "/api/auth/request-password-reset", captcha: "reset-token" }]),
  );
});
