import { afterEach, beforeEach, expect, test } from "bun:test";
import { cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { PickRow } from "@/data/picks";
import { item, renderInApp, resetServer } from "../../../test/add-app";
import { DEFAULT_SHARED } from "./commit-input";
import type { AddItem, Ownership } from "./commit-input";

const { AddRows } = await import("./add-rows");

const COLLECTION: Ownership = { kind: "collection", shared: DEFAULT_SHARED };

beforeEach(resetServer);
afterEach(cleanup);

function renderRows({
  items = [],
  picks = [],
  ownership = COLLECTION,
}: {
  readonly items?: readonly AddItem[];
  readonly picks?: readonly PickRow[];
  readonly ownership?: Ownership | null;
} = {}) {
  const calls = { retried: [] as number[], discarded: [] as number[], removed: [] as string[] };
  renderInApp(
    <AddRows
      picks={picks}
      rows={items.map(({ itemId }) => ({ itemId, overrides: {}, selected: true }))}
      items={new Map(items.map((entry) => [entry.itemId, entry]))}
      lookup="found"
      ownership={ownership}
      currency="USD"
      dateFormat="MM/DD/YYYY"
      issues={[]}
      onSelect={() => {}}
      onSelectAll={() => {}}
      onEdit={() => {}}
      onRemove={(itemId) => calls.removed.push(itemId)}
      onRetryPick={(mfcItemId) => calls.retried.push(mfcItemId)}
      onDiscardPick={(mfcItemId) => calls.discarded.push(mfcItemId)}
    />,
  );
  return calls;
}

const failed = (reason: Extract<PickRow, { state: "failed" }>["reason"]): PickRow => ({
  mfcItemId: 98_777 as PickRow["mfcItemId"],
  title: "Picked Miku",
  state: "failed",
  reason,
});

test("the price placeholder shows the release price only when its currency is the user's", async () => {
  renderRows({
    items: [
      item("usd000000001", { title: "Dollars" }),
      item("jpy000000001", {
        title: "Yen",
        latestRelease: { id: "r", date: "2027-02-01", price: 2_500_000, priceCurrency: "JPY" },
      }),
    ],
  });
  const dollars = await screen.findByRole("textbox", { name: "Price for Dollars" });
  expect(dollars.getAttribute("placeholder")).toBe("$5,000.00");
  const yen = screen.getByRole("textbox", { name: "Price for Yen" });
  expect(yen.getAttribute("placeholder")).toBe("$0.00");
  expect(screen.getByText("¥25,000")).toBeDefined();
});

test("every row control is named after its Item", async () => {
  const user = userEvent.setup();
  const calls = renderRows({ items: [item("miku00000001", { title: "Miku" })] });

  await screen.findByRole("checkbox", { name: "Select Miku" });
  expect(screen.getByRole("spinbutton", { name: "Count for Miku" })).toBeDefined();
  expect(screen.getByRole("combobox", { name: "Condition for Miku" })).toBeDefined();
  expect(screen.getByRole("link", { name: "MFC #1000" }).getAttribute("href")).toBe(
    "https://myfigurecollection.net/item/1000",
  );

  await user.click(screen.getByRole("button", { name: "Remove Miku" }));
  expect(calls.removed).toEqual(["miku00000001"]);
});

test("details open inline and depend on the ownership", async () => {
  const user = userEvent.setup();
  renderRows({ items: [item("miku00000001", { title: "Miku" })] });

  const details = await screen.findByRole("button", { name: "Details for Miku" });
  expect(details.getAttribute("aria-expanded")).toBe("false");
  await user.click(details);
  expect(details.getAttribute("aria-expanded")).toBe("true");
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.getByRole("textbox", { name: "Shop" })).toBeDefined();
  expect(screen.getByRole("textbox", { name: "Notes" })).toBeDefined();
  expect(screen.getByRole("group", { name: "Score for Miku" })).toBeDefined();
  expect(screen.queryByRole("combobox", { name: "Status" })).toBeNull();
  for (const date of ["Order Date", "Payment Date", "Shipping Date", "Collection Date"]) {
    expect(screen.getByText(date)).toBeDefined();
  }
});

test("an Order Item's details leave out what the Order gives it", async () => {
  const user = userEvent.setup();
  renderRows({
    items: [item("miku00000001", { title: "Miku" })],
    ownership: {
      kind: "order",
      order: { kind: "existing", order: { id: "orderid12345", title: "Spring" } },
    },
  });
  await user.click(await screen.findByRole("button", { name: "Details for Miku" }));
  expect(screen.queryByRole("textbox", { name: "Shop" })).toBeNull();
  expect(screen.getByRole("textbox", { name: "Notes" })).toBeDefined();
  expect(screen.getByText(/take their Shop, dates and Shipping Method/u)).toBeDefined();
});

test("Not owned hides the purchase fields and details", async () => {
  renderRows({
    items: [item("miku00000001", { title: "Miku" })],
    ownership: { kind: "none" },
  });
  await screen.findByRole("checkbox", { name: "Select Miku" });
  expect(screen.queryByRole("textbox", { name: "Price for Miku" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Details for Miku" })).toBeNull();
});

test("a saving pick shows its MFC title and spinner, with nothing to click", async () => {
  renderRows({
    picks: [{ mfcItemId: 98_777 as PickRow["mfcItemId"], title: "Picked Miku", state: "saving" }],
  });
  await screen.findByText("Saving…");
  expect(screen.getByText("Picked Miku")).toBeDefined();
  expect(screen.queryByRole("button", { name: /Retry/u })).toBeNull();
});

test("a rejected pick shows the server's reason, Retry, Discard and a link to MFC", async () => {
  const user = userEvent.setup();
  const calls = renderRows({
    picks: [failed({ kind: "rejected", message: "The page is broken" })],
  });

  await screen.findByText("The page is broken");
  expect(screen.getByRole("link", { name: "Open on MFC" }).getAttribute("href")).toBe(
    "https://myfigurecollection.net/item/98777",
  );
  await user.click(screen.getByRole("button", { name: "Retry Picked Miku" }));
  await user.click(screen.getByRole("button", { name: "Discard Picked Miku" }));
  expect(calls.retried).toEqual([98_777]);
  expect(calls.discarded).toEqual([98_777]);
});

test("a pick hidden by SFW mode also links to MFC's settings", async () => {
  renderRows({
    picks: [
      failed({
        kind: "rejected",
        message: "Turn off SFW mode in your MyFigureCollection menu to save this NSFW item",
      }),
    ],
  });
  const settings = await screen.findByRole("link", { name: "Open MFC settings" });
  expect(settings.getAttribute("href")).toBe("https://myfigurecollection.net/settings/");
});

test("a pick waiting for a verified email has no Retry, since the notice holds the resend", async () => {
  renderRows({ picks: [failed({ kind: "unverified" })] });
  await screen.findByText("Verify your email to add these.");
  expect(screen.queryByRole("button", { name: /Retry/u })).toBeNull();
  expect(screen.getByRole("button", { name: "Discard Picked Miku" })).toBeDefined();
});

test("a busy or unsaved pick offers Retry", async () => {
  renderRows({ picks: [failed({ kind: "busy" })] });
  await screen.findByText(/added a lot of items this hour/u);
  expect(screen.getByRole("button", { name: "Retry Picked Miku" })).toBeDefined();
});
