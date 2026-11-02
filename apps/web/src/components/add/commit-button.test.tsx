import { afterEach, beforeEach, expect, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { refused, resetServer, server } from "../../../test/add-app";
import { DEFAULT_ORDER_FIELDS, DEFAULT_SHARED } from "./commit-input";
import type { CommitIssue, CommitRow, Destination } from "./commit-input";

const { CommitButton } = await import("./commit-button");

const ROWS: readonly CommitRow[] = [
  { row: { itemId: "miku00000001", overrides: {}, selected: true }, title: "Miku" },
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

beforeEach(resetServer);
afterEach(cleanup);

function renderButton({
  rows = ROWS,
  destination = COLLECTION,
  emailVerified = true,
  loading = false,
}: {
  readonly rows?: readonly CommitRow[];
  readonly destination?: Destination;
  readonly emailVerified?: boolean;
  readonly loading?: boolean;
} = {}) {
  const calls = {
    committed: 0,
    done: 0,
    sending: 0,
    failed: 0,
    issues: [] as (readonly CommitIssue[])[],
  };
  render(
    <QueryClientProvider client={new QueryClient()}>
      <CommitButton
        rows={rows}
        count={rows.length}
        destination={destination}
        emailVerified={emailVerified}
        loading={loading}
        onIssues={(issues) => calls.issues.push(issues)}
        onSending={() => {
          calls.sending += 1;
        }}
        onFailed={() => {
          calls.failed += 1;
        }}
        onCommitted={() => {
          calls.committed += 1;
        }}
        onDone={() => {
          calls.done += 1;
        }}
      />
    </QueryClientProvider>,
  );
  return calls;
}

test("the label states what the click does, and a click commits", async () => {
  const user = userEvent.setup();
  const calls = renderButton();
  await user.click(screen.getByRole("button", { name: "Add 1 to collection" }));
  await waitFor(() => expect(calls.committed).toBe(1));
  expect(server.commits).toHaveLength(1);
  expect(calls.sending).toBe(1);
  expect(calls.failed).toBe(0);
});

test("Keep in Item Database clears without a request", async () => {
  const user = userEvent.setup();
  const calls = renderButton({ destination: NOT_OWNED });
  await user.click(screen.getByRole("button", { name: "Keep 1 in Item Database" }));
  expect(calls.done).toBe(1);
  expect(server.commits).toEqual([]);
});

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
  "%s has its verb for a narrow row, and its whole label as its name at every width",
  (_name, destination, emailVerified, label, verb) => {
    renderButton({ destination, emailVerified });
    const button = screen.getByRole("button", { name: label });
    const short = [...button.querySelectorAll('[aria-hidden="true"]')].filter(
      (element) => element.closest(".invisible") === null,
    );
    expect(short.map((element) => element.textContent)).toEqual([verb]);
    expect(short[0]?.className).toContain("@max-");
    expect(button.getAttribute("aria-label")).toBeNull();
  },
);

test("it is disabled for an unverified email and says why", () => {
  renderButton({ emailVerified: false });
  const button = screen.getByRole("button", { name: "Verify your email to add items" });
  expect(button.hasAttribute("disabled")).toBe(true);
});

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

test("a failed commit keeps the rows, and retrying the same click reuses its commitId", async () => {
  server.commitAnswer = async () => refused(503, "down");
  const user = userEvent.setup();
  const calls = renderButton();
  const button = screen.getByRole("button", { name: "Add 1 to collection" });

  await user.click(button);
  await waitFor(() => expect(server.commits).toHaveLength(1));
  await waitFor(() => expect(button.getAttribute("aria-busy")).toBeNull());
  expect(calls.committed).toBe(0);
  expect(calls.failed).toBe(1);

  await user.click(button);
  await waitFor(() => expect(server.commits).toHaveLength(2));
  expect(server.commits[1]?.commitId).toBe(server.commits[0]?.commitId ?? "");
});

test("an amount it cannot read names the field and sends nothing", async () => {
  const user = userEvent.setup();
  const calls = renderButton({
    rows: [
      {
        row: { itemId: "miku00000001", overrides: { price: "1.234" }, selected: true },
        title: "M",
      },
    ],
  });
  await user.click(screen.getByRole("button", { name: "Add 1 to collection" }));
  expect(calls.issues.at(-1)?.[0]?.fieldId).toBe("add-price-miku00000001");
  expect(server.commits).toEqual([]);
});
