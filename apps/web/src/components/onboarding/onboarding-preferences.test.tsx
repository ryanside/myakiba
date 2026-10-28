import { afterEach, expect, mock, test } from "bun:test";
import { cleanup, configure, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toast";
import { answerAuth, refuse, resetAuthAnswers, type } from "../../../test/better-auth";
import type { AuthRequest } from "../../../test/better-auth";

configure({ asyncUtilTimeout: 3000 });

let invalidations = 0;
const session = { user: { currency: "USD", dateFormat: "MM/DD/YYYY", username: "fixture" } };
const realRouter = await import("@tanstack/react-router");
await mock.module("@tanstack/react-router", () => ({
  ...realRouter,
  useNavigate: () => async () => {},
  useRouter: () => ({
    invalidate: async () => {
      invalidations += 1;
    },
  }),
  getRouteApi: () => ({ useRouteContext: () => ({ session }) }),
}));
const { OnboardingDialog } = await import("./onboarding-dialog");

const PREFERENCES_STEP_TITLE = "Set your username, currency, and date format.";

afterEach(() => {
  cleanup();
  localStorage.clear();
  resetAuthAnswers();
  invalidations = 0;
});

function serve(answer: (request: AuthRequest) => Response) {
  return answerAuth((request) =>
    request.path === "/is-username-available"
      ? Response.json({ available: true })
      : answer(request),
  );
}

async function openPreferencesStep() {
  localStorage.setItem("myakiba:onboarding-v2", JSON.stringify({ hasSeen: true }));
  render(
    <QueryClientProvider client={new QueryClient()}>
      <Toaster>
        <OnboardingDialog renderTrigger={<button type="button">Getting Started</button>} />
      </Toaster>
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Getting Started" }));
  // Getting Started opens at the welcome step.
  await screen.findByRole("dialog", { name: "Welcome to myakiba." });
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  await screen.findByRole("dialog", { name: PREFERENCES_STEP_TITLE });
}

async function savePreferences() {
  await openPreferencesStep();
  type("Username", "collector");
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
}

test("saved onboarding preferences move on to the next step", async () => {
  const requests = serve(() => Response.json({ status: true }));

  await savePreferences();

  expect(
    await screen.findByRole("dialog", { name: "Install the myakiba extension." }),
  ).toBeTruthy();
  expect(invalidations).toBe(1);
  expect(requests.filter(({ path }) => path === "/update-user")).toEqual([
    {
      path: "/update-user",
      body: { username: "collector", currency: "USD", dateFormat: "MM/DD/YYYY" },
    },
  ]);
});

test("refused onboarding preferences show the server's text and stay on the step", async () => {
  serve(() =>
    refuse(400, "Bad Request", { code: "USERNAME_IS_ALREADY_TAKEN", message: "Username taken" }),
  );

  await savePreferences();

  expect(await screen.findByText("Username taken")).toBeTruthy();
  expect(screen.getByRole("dialog", { name: PREFERENCES_STEP_TITLE })).toBeTruthy();
  expect(invalidations).toBe(0);
});

test("onboarding preferences refused without a message show the dialog's own text", async () => {
  serve(() => refuse(500, "Internal Server Error"));

  await savePreferences();

  expect(await screen.findByText("Couldn't save preferences.")).toBeTruthy();
});

test("a taken username says so during onboarding", async () => {
  answerAuth(() => Response.json({ available: false }));
  await openPreferencesStep();

  type("Username", "taken");

  expect(await screen.findByText("Username is already taken")).toBeTruthy();
});

test("a username check the server refuses shows its text during onboarding", async () => {
  answerAuth(() => refuse(422, "Unprocessable Entity", { message: "Username is invalid" }));
  await openPreferencesStep();

  type("Username", "bad name");

  expect(await screen.findByText("Username is invalid")).toBeTruthy();
});

test("a network failure saving onboarding preferences shows safe feedback and stays", async () => {
  serve(() => {
    throw new TypeError("Failed to fetch");
  });
  await savePreferences();
  expect(
    await screen.findByText("Couldn't connect. Check your connection and try again."),
  ).toBeTruthy();
  expect(screen.getByRole("dialog", { name: PREFERENCES_STEP_TITLE })).toBeTruthy();
  expect(invalidations).toBe(0);
});

test("a network failure checking an onboarding username shows safe feedback", async () => {
  answerAuth(() => {
    throw new TypeError("Failed to fetch");
  });
  await openPreferencesStep();
  type("Username", "collector");
  expect(
    await screen.findByText("Couldn't connect. Check your connection and try again."),
  ).toBeTruthy();
});
