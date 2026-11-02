import { afterEach, beforeEach, expect, setDefaultTimeout, test } from "bun:test";
import {
  act,
  cleanup,
  configure,
  fireEvent,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { PickRow } from "@/data/picks";
import {
  item,
  loadExtension,
  openAddPage,
  renderInApp,
  resetServer,
  seedItems,
  server,
} from "../../../test/add-app";

const { PickStatus } = await import("./pick-status");

configure({ asyncUtilTimeout: 3000 });
setDefaultTimeout(30_000);

const DRAFT_KEY = "myakiba:add-draft";
const YEN_RELEASE = {
  id: "00000000-0000-4000-8000-000000000001",
  date: "2027-02-01",
  type: null,
  barcode: null,
  price: 2_500_000,
  priceCurrency: "JPY",
};

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  resetServer();
  loadExtension({});
  seedItems(item("miku00000001", { title: "Miku" }));
});
afterEach(cleanup);

const draft = (...itemIds: readonly string[]) =>
  sessionStorage.setItem(
    DRAFT_KEY,
    JSON.stringify(itemIds.map((itemId) => ({ itemId, overrides: {}, selected: true }))),
  );

function renderPick(pick: PickRow) {
  const calls = { retried: [] as number[], discarded: [] as number[] };
  renderInApp(
    <PickStatus
      pick={pick}
      onRetry={(mfcItemId) => calls.retried.push(mfcItemId)}
      onDiscard={(mfcItemId) => calls.discarded.push(mfcItemId)}
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

test("a blank price reads as its release's price only when that is in the user's currency", async () => {
  seedItems(
    item("usd000000001", { title: "Dollars" }),
    item("jpy000000001", { title: "Yen", latestRelease: YEN_RELEASE }),
  );
  draft("usd000000001", "jpy000000001");
  const user = userEvent.setup();
  openAddPage("/add?to=collection");

  const dollars = await screen.findByRole("textbox", { name: "Price for Dollars" });
  expect(dollars.getAttribute("placeholder")).toBe("$5,000.00");
  const yen = screen.getByRole("textbox", { name: "Price for Yen" });
  expect(yen.getAttribute("placeholder")).toBe("No price");

  await user.click(screen.getByRole("button", { name: "Details for Yen" }));
  expect(screen.getByRole("combobox", { name: "Release for Yen" }).textContent).toContain(
    "¥25,000",
  );
});

test("an Item's second line is only its MFC number, with no date, price or badges", async () => {
  seedItems(
    item("owned0000001", {
      title: "Owned",
      externalId: 4242,
      collectionCount: 2,
      onOrderCount: 1,
      wishlisted: true,
    }),
  );
  draft("owned0000001");
  openAddPage("/add?to=collection");

  await screen.findByRole("checkbox", { name: "Select Owned" });
  const cell = screen.getByRole("link", { name: "Owned" }).parentElement;
  expect(cell?.textContent).toBe("OwnedMFC #4242");
});

test("a custom Item reads Custom item, with no MFC link", async () => {
  seedItems(item("custom000001", { title: "Mine", externalId: null }));
  draft("custom000001");
  openAddPage("/add?to=collection");

  await screen.findByRole("checkbox", { name: "Select Mine" });
  expect(screen.getByText("Custom item")).toBeDefined();
  expect(screen.queryByRole("link", { name: /^MFC #/u })).toBeNull();
});

test("every row control is named after its Item", async () => {
  draft("miku00000001");
  const user = userEvent.setup();
  openAddPage("/add?to=collection");

  await screen.findByRole("checkbox", { name: "Select Miku" });
  expect(screen.getByRole("spinbutton", { name: "Count for Miku" })).toBeDefined();
  expect(screen.getByRole("combobox", { name: "Condition for Miku" })).toBeDefined();
  expect(screen.getByRole("link", { name: "MFC #1000" }).getAttribute("href")).toBe(
    "https://myfigurecollection.net/item/1000",
  );

  await user.click(screen.getByRole("button", { name: "Remove Miku" }));
  await screen.findByText("No items yet");
});

test("details open inline and depend on the destination", async () => {
  draft("miku00000001");
  const user = userEvent.setup();
  openAddPage("/add?to=collection");

  const details = await screen.findByRole("button", { name: "Details for Miku" });
  expect(details.getAttribute("aria-expanded")).toBe("false");
  expect(details.hasAttribute("aria-controls")).toBe(false);
  await user.click(details);
  expect(details.getAttribute("aria-expanded")).toBe("true");
  expect(document.querySelector(`[id="${details.getAttribute("aria-controls")}"]`)).not.toBeNull();
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.getByRole("textbox", { name: "Shop for Miku" })).toBeDefined();
  expect(screen.getByRole("textbox", { name: "Notes for Miku" })).toBeDefined();
  expect(screen.getByRole("textbox", { name: "Tags for Miku" })).toBeDefined();
  expect(screen.getByRole("combobox", { name: "Shipping Method for Miku" })).toBeDefined();
  expect(screen.getByRole("group", { name: "Score for Miku" })).toBeDefined();
  expect(screen.queryByRole("combobox", { name: "Status" })).toBeNull();
  for (const date of ["Order Date", "Payment Date", "Shipping Date", "Collection Date"]) {
    expect(screen.getByRole("button", { name: `${date} for Miku` })).toBeDefined();
  }

  await user.click(details);
  expect(details.getAttribute("aria-expanded")).toBe("false");
  expect(screen.queryByRole("textbox", { name: "Notes for Miku" })).toBeNull();
});

test("an Order Item's details leave out what the Order gives it", async () => {
  draft("miku00000001");
  const user = userEvent.setup();
  openAddPage("/add?to=order-new");
  await user.click(await screen.findByRole("button", { name: "Details for Miku" }));

  const details = within(screen.getByRole("group", { name: "Details for Miku" }));
  expect(details.queryByRole("textbox", { name: /^Shop/u })).toBeNull();
  expect(details.queryByRole("combobox", { name: /^Shipping Method/u })).toBeNull();
  expect(details.queryByRole("button", { name: /Date/u })).toBeNull();
  expect(details.getByRole("textbox", { name: "Notes for Miku" })).toBeDefined();
});

test("with nothing chosen, details wait and say why, and Item Database hides the purchase fields", async () => {
  draft("miku00000001");
  const user = userEvent.setup();
  openAddPage("/add");

  const details = await screen.findByRole("button", { name: "Details for Miku" });
  expect(details.hasAttribute("disabled")).toBe(true);
  expect(details.getAttribute("title")).toBe("Choose where these go to add details");
  expect(screen.getByRole("textbox", { name: "Price for Miku" })).toBeDefined();
  expect(screen.getByRole("spinbutton", { name: "Count for Miku" })).toBeDefined();
  expect(screen.getByRole("combobox", { name: "Condition for Miku" })).toBeDefined();

  await user.click(screen.getByRole("combobox", { name: "Where these go" }));
  await user.click(await screen.findByRole("option", { name: "Item Database" }));
  await screen.findByRole("button", { name: "Keep 1 in Item Database" });
  expect(screen.queryByRole("textbox", { name: "Price for Miku" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Details for Miku" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Fill all" })).toBeNull();
});

const rowOrder = () =>
  [...document.querySelectorAll<HTMLElement>("tbody tr[data-row]")].map(
    ({ dataset }) => dataset.row,
  );

const sortBy = async (user: ReturnType<typeof userEvent.setup>, name: string) =>
  user.click(screen.getByRole("button", { name }));

test("a header sorts its column both ways, then returns to the draft's order", async () => {
  seedItems(item("rem000000001", { title: "Rem" }), item("aqua00000001", { title: "Aqua" }));
  draft("miku00000001", "rem000000001", "aqua00000001");
  const user = userEvent.setup();
  openAddPage("/add?to=collection");
  await screen.findByRole("checkbox", { name: "Select Miku" });
  expect(rowOrder()).toEqual(["miku00000001", "rem000000001", "aqua00000001"]);

  await sortBy(user, "Item");
  expect(rowOrder()).toEqual(["aqua00000001", "miku00000001", "rem000000001"]);
  await sortBy(user, "Item");
  expect(rowOrder()).toEqual(["rem000000001", "miku00000001", "aqua00000001"]);
  await sortBy(user, "Item");
  expect(rowOrder()).toEqual(["miku00000001", "rem000000001", "aqua00000001"]);
});

test("Price sorts by what each row will save, and a row with no fields stays on top", async () => {
  seedItems(item("rem000000001", { title: "Rem" }));
  sessionStorage.setItem(
    DRAFT_KEY,
    JSON.stringify([
      { itemId: "miku00000001", overrides: { price: "9000" }, selected: true },
      { itemId: "gone00000001", overrides: {}, selected: true },
      { itemId: "rem000000001", overrides: {}, selected: true },
    ]),
  );
  const user = userEvent.setup();
  openAddPage("/add?to=collection");
  await screen.findByText("No longer in myakiba");

  await sortBy(user, "Price");
  expect(rowOrder()).toEqual(["gone00000001", "rem000000001", "miku00000001"]);
  await sortBy(user, "Price");
  expect(rowOrder()).toEqual(["gone00000001", "miku00000001", "rem000000001"]);
});

test("an edit under a sort keeps the row where it is, with focus in it", async () => {
  seedItems(item("rem000000001", { title: "Rem" }));
  draft("miku00000001", "rem000000001");
  const user = userEvent.setup();
  openAddPage("/add?to=collection");
  await screen.findByRole("checkbox", { name: "Select Miku" });
  await sortBy(user, "Count");
  const order = rowOrder();

  const count = screen.getByRole("spinbutton", { name: "Count for Rem" });
  await user.click(count);
  await user.keyboard("9");
  expect(rowOrder()).toEqual(order);
  expect(document.activeElement).toBe(count);

  await sortBy(user, "Count");
  expect(rowOrder()).toEqual(["rem000000001", "miku00000001"]);
});

test("the headers only sort, with no menu to hide, move or pin a column", async () => {
  draft("miku00000001");
  openAddPage("/add?to=collection");
  await screen.findByRole("checkbox", { name: "Select Miku" });
  for (const name of ["Item", "Price", "Count", "Condition"]) {
    expect(screen.getByRole("button", { name }).hasAttribute("aria-haspopup")).toBe(false);
  }
});

test("a selected row is the grid's selected row, and an unselected one is not dimmed", async () => {
  sessionStorage.setItem(
    DRAFT_KEY,
    JSON.stringify([
      { itemId: "miku00000001", overrides: {}, selected: true },
      { itemId: "rem000000001", overrides: {}, selected: false },
    ]),
  );
  seedItems(item("rem000000001", { title: "Rem" }));
  openAddPage("/add?to=collection");
  await screen.findByRole("checkbox", { name: "Select Miku" });
  const row = (id: string) => document.querySelector<HTMLElement>(`tr[data-row="${id}"]`);
  expect(row("miku00000001")?.dataset.state).toBe("selected");
  expect(row("rem000000001")?.dataset.state).toBeUndefined();
  expect(row("rem000000001")?.querySelector(".opacity-50")).toBeNull();
});

test("a row loading has its selection's tint and its place from the first paint", async () => {
  let answer = () => {};
  server.itemsGate = new Promise<void>((resolve) => {
    answer = resolve;
  });
  draft("miku00000001");
  openAddPage("/add?to=collection");
  await waitFor(() =>
    expect(document.querySelector<HTMLElement>('tr[data-row="miku00000001"]')?.dataset.state).toBe(
      "selected",
    ),
  );
  const row = document.querySelector('tr[data-row="miku00000001"]');
  const cells = () => row?.querySelectorAll("td").length;
  expect(cells()).toBe(6);
  await act(async () => answer());
  await screen.findByRole("checkbox", { name: "Select Miku" });
  expect(document.querySelector('tr[data-row="miku00000001"]')).toBe(row);
  expect(cells()).toBe(6);
});

test("a row's details close when the destination stops being owned, and come back with it", async () => {
  draft("miku00000001");
  const user = userEvent.setup();
  openAddPage("/add?to=collection");
  await user.click(await screen.findByRole("button", { name: "Details for Miku" }));
  expect(screen.getByRole("group", { name: "Details for Miku" })).toBeDefined();

  await user.click(screen.getByRole("combobox", { name: "Where these go" }));
  await user.click(await screen.findByRole("option", { name: "Item Database" }));
  expect(screen.queryByRole("group", { name: "Details for Miku" })).toBeNull();

  await user.click(screen.getByRole("combobox", { name: "Where these go" }));
  await user.click(await screen.findByRole("option", { name: "Collection" }));
  expect(screen.getByRole("group", { name: "Details for Miku" })).toBeDefined();
});

test("a saving pick shows its MFC title and spinner, with nothing to click", async () => {
  renderPick({ mfcItemId: 98_777 as PickRow["mfcItemId"], title: "Picked Miku", state: "saving" });
  await screen.findByText("Saving…");
  expect(screen.getByText("Picked Miku")).toBeDefined();
  expect(screen.queryByRole("button", { name: /Retry/u })).toBeNull();
});

test("a rejected pick shows the server's reason, Retry, Discard and a link to MFC", async () => {
  const user = userEvent.setup();
  const calls = renderPick(failed({ kind: "rejected", message: "The page is broken" }));

  await screen.findByText("The page is broken");
  expect(screen.getByRole("link", { name: "Open on MFC" }).getAttribute("href")).toBe(
    "https://myfigurecollection.net/item/98777",
  );
  await user.click(screen.getByRole("button", { name: "Retry Picked Miku" }));
  await user.click(screen.getByRole("button", { name: "Discard Picked Miku" }));
  expect(calls.retried).toEqual([98_777]);
  expect(calls.discarded).toEqual([98_777]);
});

test("a pick waiting for a verified email has no Retry, since the notice holds the resend", async () => {
  renderPick(failed({ kind: "unverified" }));
  await screen.findByText("Verify your email to add these.");
  expect(screen.queryByRole("button", { name: /Retry/u })).toBeNull();
  expect(screen.getByRole("button", { name: "Discard Picked Miku" })).toBeDefined();
});

test.each([
  [{ kind: "busy" } as const, /added a lot of items this hour/u],
  [{ kind: "unsaved" } as const, /myakiba could not save this item/u],
])("a %j pick offers Retry", async (reason, text) => {
  renderPick(failed(reason));
  await screen.findByText(text);
  expect(screen.getByRole("button", { name: "Retry Picked Miku" })).toBeDefined();
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Discard Picked Miku" })).toBeDefined(),
  );
});

test("a header says how its column is sorted, and the table has its name and its keys", async () => {
  seedItems(item("aaa000000001", { title: "A" }));
  draft("miku00000001", "aaa000000001");
  const user = userEvent.setup();
  openAddPage("/add?to=collection");
  await screen.findByRole("checkbox", { name: "Select A" });
  const table = screen.getByRole("table", { name: "Items to add" });
  const hint = document.querySelector(`[id="${table.getAttribute("aria-describedby")}"]`);
  expect(hint?.textContent).toContain("Arrow keys");

  const header = screen.getByRole("columnheader", { name: "Item" });
  expect(header.getAttribute("aria-sort")).toBe("none");
  await user.click(screen.getByRole("button", { name: "Item" }));
  expect(header.getAttribute("aria-sort")).toBe("ascending");
  await user.click(screen.getByRole("button", { name: "Item" }));
  expect(header.getAttribute("aria-sort")).toBe("descending");
});

test("a sort by a column that goes away is cleared, and stays cleared when it comes back", async () => {
  seedItems(item("aaa000000001", { title: "A" }));
  draft("miku00000001", "aaa000000001");
  const user = userEvent.setup();
  openAddPage("/add?to=collection");
  await screen.findByRole("checkbox", { name: "Select A" });
  await user.click(screen.getByRole("button", { name: "Condition" }));
  await user.click(screen.getByRole("combobox", { name: "Where these go" }));
  await user.click(await screen.findByRole("option", { name: "Item Database" }));
  await waitFor(() => expect(screen.queryByRole("button", { name: "Condition" })).toBeNull());

  await user.click(screen.getByRole("combobox", { name: "Where these go" }));
  await user.click(await screen.findByRole("option", { name: "Collection" }));
  const header = await screen.findByRole("columnheader", { name: "Condition" });
  expect(header.getAttribute("aria-sort")).toBe("none");
});

test("a click in the select cell's padding opens nothing", async () => {
  draft("miku00000001");
  const user = userEvent.setup();
  openAddPage("/add?to=collection");
  await screen.findByRole("checkbox", { name: "Select Miku" });
  const cell = document.querySelector('tr[data-row="miku00000001"] td[data-col="select"]');
  await user.click(cell as Element);
  expect(screen.queryByRole("group", { name: "Details for Miku" })).toBeNull();
});

test("a row whose Item is gone is not selected, since it cannot be committed", async () => {
  draft("miku00000001", "gone00000001");
  openAddPage("/add?to=collection");
  await screen.findByText("No longer in myakiba");
  const row = (id: string) => document.querySelector<HTMLElement>(`tr[data-row="${id}"]`);
  expect(row("miku00000001")?.dataset.state).toBe("selected");
  expect(row("gone00000001")?.dataset.state).toBeUndefined();
});

test("column sizes go back to the defaults when the visible columns change", async () => {
  draft("miku00000001");
  const user = userEvent.setup();
  openAddPage("/add?to=none");
  await screen.findByRole("checkbox", { name: "Select Miku" });
  const width = () => (document.querySelector('th[data-col="item"]') as HTMLElement).style.width;
  const start = width();
  const handle = document.querySelector('th[data-col="item"] .cursor-col-resize') as Element;
  fireEvent.mouseDown(handle, { clientX: 100 });
  fireEvent.mouseMove(document, { clientX: 300 });
  fireEvent.mouseUp(document, { clientX: 300 });
  await waitFor(() => expect(width()).not.toBe(start));

  await user.click(screen.getByRole("combobox", { name: "Where these go" }));
  await user.click(await screen.findByRole("option", { name: "Collection" }));
  await screen.findByRole("columnheader", { name: "Price" });
  await waitFor(() => expect(width()).toBe(start));
});

test("a row removed under a sort sends focus to the row below it on screen", async () => {
  seedItems(item("bbb000000001", { title: "B" }), item("ccc000000001", { title: "C" }));
  seedItems(item("aaa000000001", { title: "A" }));
  draft("aaa000000001", "ccc000000001", "bbb000000001");
  const user = userEvent.setup();
  openAddPage("/add?to=collection");
  await screen.findByRole("checkbox", { name: "Select A" });
  await user.click(screen.getByRole("button", { name: "Item" }));
  expect(rowOrder()).toEqual(["aaa000000001", "bbb000000001", "ccc000000001"]);

  await user.click(screen.getByRole("button", { name: "Remove A" }));

  expect(document.activeElement).toBe(screen.getByRole("button", { name: "Remove B" }));
});

test.each([
  // 1280 wide with the sidebar open and a classic scrollbar has the narrowest frame that holds them.
  [965, false],
  [2000, false],
  [400, true],
])("in a %ipx frame, the row's actions pinned: %p", async (frame, pinned) => {
  seedItems(item("aaa000000001", { title: "A" }));
  draft("aaa000000001");
  Object.defineProperty(HTMLElement.prototype, "clientWidth", {
    configurable: true,
    get: () => frame,
  });
  try {
    openAddPage("/add?to=collection");
    await screen.findByRole("checkbox", { name: "Select A" });
    const header = screen.getByRole("columnheader", { name: /^Actions/ });
    expect(header.style.position === "sticky").toBe(pinned);
    const details = screen.getByRole("button", { name: "Details for A" });
    expect(details.closest("td")?.style.position === "sticky").toBe(pinned);
    expect(details.closest("td")?.dataset.pinned !== undefined).toBe(pinned);
    const price = screen.getByRole("button", { name: "Price" });
    expect(price.closest("th")?.style.position).not.toBe("sticky");
  } finally {
    Reflect.deleteProperty(HTMLElement.prototype, "clientWidth");
  }
});

test("the last row offers both searches and is no row of the table, so keys and counts pass it by", async () => {
  draft("miku00000001");
  const user = userEvent.setup();
  openAddPage("/add?to=collection");
  const price = await screen.findByRole("textbox", { name: "Price for Miku" });
  const table = screen.getByRole("table", { name: "Items to add" });

  const mfc = screen.getByRole("link", { name: "Search MyFigureCollection (opens in a new tab)" });
  expect(mfc.getAttribute("href")).toBe("https://myfigurecollection.net/?_tb=item&keywords=");
  expect(mfc.getAttribute("target")).toBe("_blank");
  expect(mfc.getAttribute("rel")).toBe("noopener noreferrer");
  const search = screen.getByRole("button", { name: "Search myakiba" });
  for (const action of [mfc, search]) {
    expect(table.contains(action)).toBe(false);
    expect(action.closest('[data-slot="data-grid"]')).not.toBeNull();
  }
  // The header row and Miku's, and nothing for the searches.
  expect(within(table).getAllByRole("row")).toHaveLength(2);

  await user.click(price);
  await user.keyboard("{ArrowDown}");
  expect(document.activeElement).toBe(price);

  screen.getByRole("button", { name: "Remove Miku" }).focus();
  await user.tab();
  expect(document.activeElement).toBe(mfc);
  await user.tab();
  expect(document.activeElement).toBe(search);
  await user.click(search);
  const popover = await screen.findByRole("dialog", { name: "Add from myakiba" });
  expect(within(popover).getByRole("combobox", { name: "Search myakiba" })).toBeDefined();
});
