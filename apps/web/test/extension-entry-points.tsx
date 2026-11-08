// What the tests that gate the extension render: Item Refresh's gate and onboarding's notices.
import { mock } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";
import type userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement, ReactNode } from "react";
import type { ExtensionBridge } from "@/lib/extension-bridge";
import { delegatingBridge, fakeExtension } from "./fake-extension";

let extension = fakeExtension();
const { createExtensionBridge } = await import("@/lib/extension-bridge");
let bridge: ExtensionBridge = createExtensionBridge(extension.window);
await mock.module("@/lib/extension-bridge", () => ({
  createExtensionBridge,
  extensionBridge: delegatingBridge(() => bridge),
}));

const session = { user: { currency: "USD", dateFormat: "MM/DD/YYYY", username: "fixture" } };
const realRouter = await import("@tanstack/react-router");
await mock.module("@tanstack/react-router", () => ({
  ...realRouter,
  useNavigate: () => async () => {},
  useRouter: () => ({ invalidate: async () => {} }),
  getRouteApi: () => ({ useRouteContext: () => ({ session }) }),
}));

const { ExtensionRequiredDialog } =
  await import("@/components/extension/extension-required-dialog");
const { dismissMissingExtension } = await import("@/lib/extension-gate");
const { OnboardingProvider, useOpenOnboarding } =
  await import("@/components/onboarding/onboarding-dialog");

export type User = ReturnType<typeof userEvent.setup>;

export function currentExtension() {
  return extension;
}

export function loadExtension(options: Parameters<typeof fakeExtension>[0]) {
  extension = fakeExtension(options);
  bridge = createExtensionBridge(extension.window);
}

export function useBridge(next: ExtensionBridge) {
  bridge = next;
}

export function resetEntryPoints() {
  cleanup();
  dismissMissingExtension();
  localStorage.clear();
}

export const click = (name: string) => async (user: User) => {
  await user.click(await screen.findByRole("button", { name }));
};

export const noop = () => {};

export const ADD_STEP_TITLE = "Pick your first items.";

function GettingStartedButton() {
  const openOnboarding = useOpenOnboarding();
  return (
    <button type="button" onClick={openOnboarding}>
      Getting Started
    </button>
  );
}

export function onboardingDialog() {
  return (
    <OnboardingProvider>
      <GettingStartedButton />
    </OnboardingProvider>
  );
}

/** Getting Started opens at the welcome step, so this walks to the given step. */
export async function openOnboardingStep(user: User, steps: number) {
  await click("Getting Started")(user);
  for (const title of [
    "Welcome to myakiba.",
    "Set your username, currency, and date format.",
    /myakiba extension/u,
  ].slice(0, steps)) {
    await screen.findByRole("dialog", { name: title });
    await click("Continue")(user);
  }
}

export async function openAddStep(user: User) {
  await openOnboardingStep(user, 3);
  await screen.findByRole("dialog", { name: ADD_STEP_TITLE });
}

function withQueryClient(ui: ReactElement) {
  const queryClient = new QueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  render(
    <>
      {ui}
      <ExtensionRequiredDialog />
    </>,
    { wrapper },
  );
}

export const renderWithDialog = withQueryClient;
