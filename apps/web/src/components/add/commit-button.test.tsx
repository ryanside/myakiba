import { afterEach, beforeEach, expect, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { USER, resetServer, server } from "../../../test/add-app";
import { DEFAULT_ORDER_FIELDS, DEFAULT_SHARED } from "./commit-input";
import type { CommitRow, Destination } from "./commit-input";

const { CommitButton } = await import("./commit-button");

const ROWS: readonly CommitRow[] = [
  {
    row: { itemId: "miku00000001", overrides: {}, selected: true },
    title: "Miku",
    wishlisted: false,
  },
];
const COLLECTION: Destination = {
  ownership: { kind: "collection", shared: DEFAULT_SHARED },
  wishlist: false,
  lists: [],
};
const NOT_OWNED: Destination = { ownership: { kind: "none" }, wishlist: false, lists: [] };
const NEW_ORDER: Destination = {
  ownership: { kind: "order", order: { kind: "new", fields: DEFAULT_ORDER_FIELDS } },
  wishlist: false,
  lists: [],
};

beforeEach(() => {
  sessionStorage.clear();
  resetServer();
});
afterEach(cleanup);

function renderButton({
  destination = COLLECTION,
  emailVerified = true,
  loading = false,
}: {
  readonly destination?: Destination;
  readonly emailVerified?: boolean;
  readonly loading?: boolean;
} = {}) {
  const calls = { committed: 0 };
  render(
    <QueryClientProvider client={new QueryClient()}>
      <CommitButton
        userId={USER.id}
        rows={ROWS}
        count={ROWS.length}
        destination={destination}
        emailVerified={emailVerified}
        loading={loading}
        onIssues={() => {}}
        onSending={() => {}}
        onFailed={() => {}}
        onCommitted={() => {
          calls.committed += 1;
        }}
        onDone={() => {}}
      />
    </QueryClientProvider>,
  );
  return calls;
}

test("it ignores clicks while sending, so one click sends one commit", async () => {
  let answer: ((value: Awaited<ReturnType<typeof server.commitAnswer>>) => void) | undefined;
  server.commitAnswer = () =>
    new Promise((resolve) => {
      answer = resolve;
    });
  const user = userEvent.setup();
  const calls = renderButton();
  const button = screen.getByRole("button", { name: "Add 1 to collection" });

  await user.click(button);
  await waitFor(() => expect(button.getAttribute("aria-disabled")).toBe("true"));
  expect(button.getAttribute("aria-busy")).toBe("true");
  await user.click(button);
  expect(server.commits).toHaveLength(1);

  answer?.({
    data: { committed: [], orderId: null, wishlistAdded: 0, listIds: [] },
    error: null,
  });
  await waitFor(() => expect(calls.committed).toBe(1));
});

test.each([
  ["a commit", COLLECTION, true, "Add 1 to collection", "Add"],
  ["a new Order", NEW_ORDER, true, "Create order with 1", "Create"],
  ["the Item Database alone", NOT_OWNED, true, "Keep 1 in Item Database", "Keep"],
  ["a blocked new Order", NEW_ORDER, false, "Verify your email to add items", "Create"],
] as const)(
  "%s holds its verb beside its whole label, and the whole label is its name",
  (_name, destination, emailVerified, label, verb) => {
    renderButton({ destination, emailVerified });
    const button = screen.getByRole("button", { name: label });
    const short = [...button.querySelectorAll('[aria-hidden="true"]')].filter(
      (element) => element.closest(".invisible") === null,
    );
    expect(short.map((element) => element.textContent)).toEqual([verb]);
    expect(button.getAttribute("aria-label")).toBeNull();
  },
);

test("it is disabled until a choice with an effect, and while rows still load", () => {
  renderButton({ destination: { ownership: null, wishlist: false, lists: [] } });
  expect(
    screen.getByRole("button", { name: "Choose where these go" }).hasAttribute("disabled"),
  ).toBe(true);
  cleanup();
  renderButton({ loading: true });
  expect(screen.getByRole("button", { name: "Add 1 to collection" }).hasAttribute("disabled")).toBe(
    true,
  );
});
