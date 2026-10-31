import { afterEach, expect, mock, test } from "bun:test";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const sent: { readonly email: string; readonly callbackURL: string }[] = [];
const realClient = await import("@/lib/auth-client");
await mock.module("@/lib/auth-client", () => ({
  ...realClient,
  authClient: {
    sendVerificationEmail: async (request: (typeof sent)[number]) => {
      sent.push(request);
      return { data: { status: true }, error: null };
    },
  },
}));

await mock.module("@/lib/auth-redirect-url", () => ({
  getAuthRedirectUrl: (path: string) => `http://localhost:3001${path}`,
}));

const { VerifyEmailNotice } = await import("./verify-email-notice");

afterEach(cleanup);

test("the notice names the address, resends once to the Add page, then counts down", async () => {
  const user = userEvent.setup();
  render(<VerifyEmailNotice email="collector@example.com" />);
  expect(screen.getByText("collector@example.com")).toBeDefined();

  await user.click(screen.getByRole("button", { name: "Resend verification email" }));

  const cooling = await screen.findByRole("button", { name: /^Resend in \d+s$/u });
  expect(cooling.hasAttribute("disabled")).toBe(true);
  await waitFor(() => expect(sent).toHaveLength(1));
  expect(sent[0]?.email).toBe("collector@example.com");
  expect(new URL(sent[0]?.callbackURL ?? "").pathname).toBe("/add");
});
