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
import { MONEY_INPUT_HINT } from "@/lib/money-input";
import type { RowOverrides } from "./add-draft";
import { fakePick } from "../../../test/fake-extension";
import {
  item,
  loadExtension,
  openAddPage,
  refused,
  resetServer,
  seedItems,
  server,
} from "../../../test/add-app";

configure({ asyncUtilTimeout: 3000 });
setDefaultTimeout(30_000);

const ITEM_ID = "miku00000001";
const OTHER_ID = "rem000000002";
const DRAFT_KEY = "myakiba:add-draft";
const FIRST_RELEASE = "00000000-0000-4000-8000-000000000001";
const SECOND_RELEASE = "00000000-0000-4000-8000-000000000002";

type User = ReturnType<typeof userEvent.setup>;

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  resetServer();
  loadExtension({});
  seedItems(
    item(ITEM_ID, { title: "Hatsune Miku", externalId: 98_777 }),
    item(OTHER_ID, { title: "Rem", externalId: 112_233 }),
  );
});
afterEach(cleanup);

const draft = (...itemIds: readonly string[]) =>
  sessionStorage.setItem(
    DRAFT_KEY,
    JSON.stringify(itemIds.map((itemId) => ({ itemId, overrides: {}, selected: true }))),
  );
const draftWith = (itemId: string, overrides: RowOverrides) =>
  sessionStorage.setItem(DRAFT_KEY, JSON.stringify([{ itemId, overrides, selected: true }]));
const click = (user: User, name: string | RegExp) =>
  user.click(screen.getByRole("button", { name }));
const rowsLoaded = () => screen.findAllByRole("checkbox", { name: /^Select (?!all)/u });
const chooseOption = async (user: User, field: string, option: string) => {
  await user.click(screen.getByRole("combobox", { name: field }));
  await user.click(await screen.findByRole("option", { name: option }));
};
const destination = (user: User, name: string) => chooseOption(user, "Where these go", name);
const pause = (ms: number) =>
  act(async () => {
    await new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  });
const openDetails = async (user: User, title: string) => {
  await user.click(await screen.findByRole("button", { name: `Details for ${title}` }));
};
const pickDay = async (user: User, name: string) => {
  await user.click(screen.getByRole("button", { name }));
  const [day] = await screen.findAllByRole("button", { name: /15th/u });
  if (day === undefined) throw new Error(`no 15th in the ${name} calendar`);
  await user.click(day);
  await user.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("grid")).toBeNull());
};

/** Holds the commit until the returned function runs. */
function holdCommit() {
  let release = () => {};
  const { commitAnswer } = server;
  server.commitAnswer = async (body) => {
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    return commitAnswer(body);
  };
  return () => act(async () => release());
}

// ---------------------------------------------------------------------------------- Destination

test("the destination menu is exactly Collection, New Order, Existing Order and Item Database", async () => {
  draft(ITEM_ID);
  const user = userEvent.setup();
  openAddPage();
  await rowsLoaded();
  await user.click(screen.getByRole("combobox", { name: "Where these go" }));

  const options = await screen.findAllByRole("option");
  expect(options.map(({ textContent }) => textContent)).toEqual([
    "Collection",
    "New Order",
    "Existing Order",
    "Item Database",
  ]);
});

test("the page has no Columns selector and no More Order details", async () => {
  draft(ITEM_ID);
  openAddPage("/add?to=order-new");
  await rowsLoaded();
  expect(screen.queryByRole("button", { name: /Columns/u })).toBeNull();
  expect(screen.queryByText(/More Order details/u)).toBeNull();
});

test("the sentence counts the selected rows of all, and reads Keep for the Item Database", async () => {
  draft(ITEM_ID, OTHER_ID);
  const user = userEvent.setup();
  openAddPage("/add?to=collection");
  await rowsLoaded();
  const sentence = () => screen.getByRole("region", { name: "Destination" }).textContent;
  await waitFor(() => expect(sentence()).toContain("Add 2 items to"));

  await user.click(screen.getByRole("checkbox", { name: "Select Rem" }));
  expect(sentence()).toContain("Add 1 of 2 items to");

  await destination(user, "Item Database");
  expect(sentence()).toContain("Keep 1 of 2 items in");
});

test("the summary reads Item Database with nothing else named, and no mid dot anywhere", async () => {
  draft(ITEM_ID);
  server.lists.push({ id: "shelf0000001", title: "Display shelf" });
  const user = userEvent.setup();
  openAddPage("/add?to=none");
  await rowsLoaded();
  const bar = () => within(screen.getByRole("region", { name: "Commit" }));
  expect(bar().getByText("Item Database")).toBeDefined();
  expect(screen.queryByText(/nothing to save/u)).toBeNull();

  await user.click(screen.getByRole("checkbox", { name: "Wishlist" }));
  await user.click(screen.getByRole("button", { name: "Lists" }));
  await user.click(await screen.findByRole("checkbox", { name: "Display shelf" }));
  await user.keyboard("{Escape}");
  expect(bar().getByText("on your Wishlist")).toBeDefined();
  expect(bar().getByText("in ‘Display shelf’")).toBeDefined();
  expect(document.body.textContent).not.toContain("·");
});

test("trying another kind keeps what was typed, and switching New and Existing restarts them", async () => {
  draft(ITEM_ID);
  const user = userEvent.setup();
  openAddPage("/add?to=order-new");
  await rowsLoaded();
  await user.type(screen.getByRole("textbox", { name: "Shop" }), "AmiAmi");

  await destination(user, "Collection");
  await destination(user, "New Order");
  expect((screen.getByRole("textbox", { name: "Shop" }) as HTMLInputElement).value).toBe("AmiAmi");

  await destination(user, "Existing Order");
  await destination(user, "New Order");
  expect((screen.getByRole("textbox", { name: "Shop" }) as HTMLInputElement).value).toBe("");
});

test("Wishlist and Lists work with any destination, and the toast offers View list", async () => {
  draft(ITEM_ID);
  server.lists.push({ id: "shelf0000001", title: "Display shelf" });
  const user = userEvent.setup();
  const router = openAddPage("/add?to=collection");
  await rowsLoaded();
  await user.click(screen.getByRole("checkbox", { name: "Wishlist" }));
  await user.click(screen.getByRole("button", { name: "Lists" }));
  await user.click(await screen.findByRole("checkbox", { name: "Display shelf" }));
  await user.keyboard("{Escape}");
  await click(user, "Add 1 to collection");

  await screen.findByText("Added 1 to your collection");
  const notifications = screen.getByRole("region", { name: /Notifications/u });
  expect(
    within(notifications).getByText("Also on your Wishlist and in ‘Display shelf’."),
  ).toBeDefined();
  expect(server.commits[0]?.wishlist).toBe(true);
  expect(server.commits[0]?.listIds).toEqual(["shelf0000001"]);

  await user.click(within(notifications).getByRole("button", { name: "View list" }));
  await waitFor(() => expect(router.state.location.pathname).toBe("/lists/shelf0000001"));
});

test("New list at the limit of 20 Lists creates the List and does not choose it", async () => {
  draft(ITEM_ID);
  for (let index = 0; index < 21; index += 1) {
    server.lists.push({ id: `list${String(index).padStart(8, "0")}`, title: `List ${index}` });
  }
  const user = userEvent.setup();
  openAddPage("/add?to=none");
  await rowsLoaded();
  await user.click(screen.getByRole("button", { name: "Lists" }));
  for (let index = 0; index < 20; index += 1) {
    await user.click(await screen.findByRole("checkbox", { name: `List ${index}` }));
  }
  await waitFor(() =>
    expect(screen.getByRole("checkbox", { name: "List 20" }).getAttribute("aria-disabled")).toBe(
      "true",
    ),
  );

  await user.click(screen.getByRole("button", { name: "New list…" }));
  const dialog = await screen.findByRole("dialog", { name: "New List" });
  await user.type(within(dialog).getByRole("textbox", { name: /Title/u }), "One too many");
  await user.click(within(dialog).getByRole("button", { name: "Create List" }));

  await waitFor(() => expect(server.createdLists).toEqual(["One too many"]));
  await waitFor(() => expect(screen.queryByRole("dialog", { name: "New List" })).toBeNull());
  await screen.findByRole("button", { name: "20 Lists" });
});

// ------------------------------------------------------------------------------- The Order header

test("a new Order's title sits beside its picture in place of a heading, and wraps", async () => {
  draft(ITEM_ID);
  openAddPage("/add?to=order-new");
  await rowsLoaded();

  const order = within(screen.getByRole("region", { name: "New Order" }));
  expect(order.queryByText("Order details")).toBeNull();
  expect(order.queryByText(/Optional, and they apply/u)).toBeNull();
  expect(order.queryByText("Title")).toBeNull();
  expect(order.getByRole("textbox", { name: "Order title" }).tagName).toBe("TEXTAREA");
  for (const group of ["Basics", "Dates", "Costs", "Notes"]) {
    expect(order.getByRole("group", { name: group })).toBeDefined();
  }
});

test("typing on the prefilled Order title replaces it, and a cleared one falls back", async () => {
  draft(ITEM_ID, OTHER_ID);
  const user = userEvent.setup();
  openAddPage("/add?to=order-new");
  await rowsLoaded();
  const title = screen.getByRole("textbox", { name: "Order title" }) as HTMLTextAreaElement;
  expect(title.placeholder).toBe("Hatsune Miku + 1 more");

  await user.click(title);
  await user.keyboard("Spring preorders");
  expect(title.value).toBe("Spring preorders");

  await user.clear(title);
  await click(user, "Create order with 2");
  await screen.findByText("Created order ‘Hatsune Miku + 1 more’");
  expect(server.commits[0]?.ownership.order?.fields?.title).toBe("Hatsune Miku + 1 more");
});

test("Enter and a pasted line break keep the title to one paragraph", async () => {
  draft(ITEM_ID);
  const user = userEvent.setup();
  openAddPage("/add?to=order-new");
  await rowsLoaded();
  const title = screen.getByRole("textbox", { name: "Order title" }) as HTMLTextAreaElement;
  fireEvent.change(title, { target: { value: "Spring\n  preorders" } });
  expect(title.value).toBe("Spring preorders");

  await user.click(title);
  await user.keyboard("{Enter}");
  expect(title.value).not.toContain("\n");
});

test("New Order's fees and title reach the commit", async () => {
  draft(ITEM_ID);
  const user = userEvent.setup();
  openAddPage("/add?to=order-new");
  await rowsLoaded();
  await user.type(screen.getByRole("textbox", { name: "Taxes" }), "12.50");
  await screen.findByText("Fees $12.50");
  await click(user, "Create order with 1");
  await screen.findByText("Created order ‘Hatsune Miku’");

  const fields = server.commits[0]?.ownership.order?.fields ?? {};
  expect(fields.taxes).toBe(1250);
  expect(fields.title).toBe("Hatsune Miku");
});

test("a New Order's status, Shipping Method and dates all reach the commit", async () => {
  draft(ITEM_ID);
  const user = userEvent.setup();
  openAddPage("/add?to=order-new");
  await rowsLoaded();

  await chooseOption(user, "Status", "Shipped");
  await chooseOption(user, "Shipping Method", "SAL");
  for (const label of [
    "Order Date",
    "Release Date",
    "Payment Date",
    "Shipping Date",
    "Collection Date",
  ]) {
    await pickDay(user, label);
    expect(screen.getByRole("button", { name: label }).dataset.empty).toBe("false");
  }

  await click(user, "Create order with 1");
  await screen.findByText(/^Created order/u);

  const fields = server.commits[0]?.ownership.order?.fields ?? {};
  expect(fields.status).toBe("Shipped");
  expect(fields.shippingMethod).toBe("SAL");
  for (const field of [
    "orderDate",
    "releaseDate",
    "paymentDate",
    "shippingDate",
    "collectionDate",
  ]) {
    expect(String(fields[field])).toMatch(/^\d{4}-\d{2}-15$/u);
  }
});

test("a blank Release Date reads as the latest of the selected rows' releases", async () => {
  seedItems(
    item("later0000001", {
      title: "Later",
      latestRelease: {
        id: "later",
        date: "2028-03-01",
        type: null,
        barcode: null,
        price: null,
        priceCurrency: null,
      },
    }),
  );
  draft(ITEM_ID, "later0000001");
  openAddPage("/add?to=order-new");
  await rowsLoaded();
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Release Date" }).textContent).toContain(
      "03/01/2028",
    ),
  );
});

test("an Existing Order search picks the Order, shows its picture, and a preset one that is gone asks again", async () => {
  server.orders.set("spring000001", "Spring order");
  server.orderImages.set("spring000001", ["/images/spring.jpg"]);
  draft(ITEM_ID);
  const user = userEvent.setup();
  openAddPage("/add?to=order:missing00001");
  await rowsLoaded();

  const picker = await screen.findByRole("combobox", { name: "Order" });
  await waitFor(() => expect(picker.textContent).toContain("Choose an Order"));
  await user.click(picker);
  const option = await screen.findByRole("option", { name: "Spring order" });
  expect(option.querySelector("img")?.getAttribute("src")).toBe("/images/spring.jpg");
  await user.click(option);
  await waitFor(() => expect(picker.textContent).toContain("Spring order"));
  expect(screen.getByRole("heading", { name: "Spring order" })).toBeDefined();
  await click(user, "Add 1 to order Spring order");
  await waitFor(() => expect(server.commits).toHaveLength(1));
  expect<unknown>(server.commits[0]?.ownership).toEqual({
    kind: "order",
    order: { kind: "existing", orderId: "spring000001" },
  });
});

test("a commit with no Order chosen waits, and a failed Order read says so", async () => {
  draft(ITEM_ID);
  const user = userEvent.setup();
  openAddPage("/add?to=collection");
  await rowsLoaded();
  await destination(user, "Existing Order");
  expect(screen.getByRole("button", { name: "Choose an Order" }).hasAttribute("disabled")).toBe(
    true,
  );
  await user.click(screen.getByRole("combobox", { name: "Order" }));
  await screen.findByText("No Orders match.");
});

test("an Order's Item details leave out what the Order gives, and say so", async () => {
  server.orders.set("spring000001", "Spring order");
  draft(ITEM_ID);
  const user = userEvent.setup();
  openAddPage("/add?to=order:spring000001");
  await waitFor(() =>
    expect(screen.getByRole("combobox", { name: "Order" }).textContent).toContain("Spring order"),
  );
  await openDetails(user, "Hatsune Miku");

  const details = within(screen.getByRole("group", { name: "Details for Hatsune Miku" }));
  expect(details.queryByRole("textbox", { name: /^Shop/u })).toBeNull();
  expect(details.queryByRole("button", { name: /Date/u })).toBeNull();
  expect(details.getByRole("textbox", { name: "Notes for Hatsune Miku" })).toBeDefined();
  expect(
    details.getByText("Order Items take their Shop, dates and Shipping Method from the Order."),
  ).toBeDefined();
});

// -------------------------------------------------------------------------------------- Releases

test("the Release control and its menu show date, type, barcode and price in the release's own currency", async () => {
  server.releases.set(ITEM_ID, [
    {
      id: FIRST_RELEASE,
      itemId: ITEM_ID,
      date: "2026-05-01",
      type: "Limited",
      barcode: "4580590174562",
      price: 2_500_000,
      priceCurrency: "JPY",
    },
    {
      id: SECOND_RELEASE,
      itemId: ITEM_ID,
      date: "2027-01-15",
      type: "Resale",
      barcode: "4580590174999",
      price: 500_000,
      priceCurrency: "USD",
    },
  ]);
  seedItems(
    item(ITEM_ID, {
      title: "Hatsune Miku",
      latestRelease: {
        id: SECOND_RELEASE,
        date: "2027-01-15",
        type: "Resale",
        barcode: "4580590174999",
        price: 500_000,
        priceCurrency: "USD",
      },
    }),
  );
  draft(ITEM_ID);
  const user = userEvent.setup();
  openAddPage("/add?to=collection");
  await openDetails(user, "Hatsune Miku");

  const control = () => screen.getByRole("combobox", { name: "Release for Hatsune Miku" });
  for (const text of ["01/15/2027", "Resale", "4580590174999", "$5,000.00"]) {
    expect(control().textContent).toContain(text);
  }

  await user.click(control());
  const [first, second] = await screen.findAllByRole("option");
  for (const text of ["05/01/2026", "Limited", "4580590174562", "¥25,000"]) {
    expect(first?.textContent).toContain(text);
  }
  for (const text of ["01/15/2027", "Resale", "4580590174999", "$5,000.00"]) {
    expect(second?.textContent).toContain(text);
  }

  await user.click(first as HTMLElement);
  await waitFor(() => {
    for (const text of ["05/01/2026", "Limited", "4580590174562", "¥25,000"]) {
      expect(control().textContent).toContain(text);
    }
  });
  expect(
    screen.getByRole("textbox", { name: "Price for Hatsune Miku" }).getAttribute("placeholder"),
  ).toBe("No price");
  expect(document.body.textContent).not.toMatch(/convert|currenc/iu);

  await click(user, "Add 1 to collection");
  await waitFor(() => expect(server.commits).toHaveLength(1));
  expect(server.commits[0]?.rows[0]?.releaseId).toBe(FIRST_RELEASE);
});

test("the total counts what will be saved, and a release in another currency adds nothing", async () => {
  seedItems(
    item("yen000000001", {
      title: "Yen",
      latestRelease: {
        id: "yen",
        date: "2027-02-01",
        type: null,
        barcode: null,
        price: 2_500_000,
        priceCurrency: "JPY",
      },
    }),
  );
  draft(ITEM_ID, "yen000000001");
  openAddPage("/add?to=collection");
  await rowsLoaded();

  const bar = within(screen.getByRole("region", { name: "Commit" }));
  await bar.findByText("Total $5,000.00");
  expect(document.body.textContent).not.toMatch(/convert|currenc/iu);
});

test("a price the page cannot read hides the total, and a commit points at it", async () => {
  draftWith(ITEM_ID, { price: "1.234" });
  const user = userEvent.setup();
  openAddPage("/add?to=collection");
  await rowsLoaded();
  expect(screen.queryByText(/^Total /u)).toBeNull();

  await click(user, "Add 1 to collection");

  const price = await screen.findByRole("textbox", { name: "Price for Hatsune Miku" });
  await waitFor(() => expect(document.activeElement).toBe(price));
  expect(price.getAttribute("aria-invalid")).toBe("true");
  expect(document.querySelector(`[id="add-price-${ITEM_ID}-error"]`)).not.toBeNull();
  expect(server.commits).toEqual([]);

  await user.clear(price);
  expect(document.querySelector(`[id="add-price-${ITEM_ID}-error"]`)).toBeNull();
});

test("a fee the page cannot read shows beside its field, which takes focus", async () => {
  draft(ITEM_ID);
  const user = userEvent.setup();
  openAddPage("/add?to=order-new");
  await rowsLoaded();
  const taxes = screen.getByRole("textbox", { name: "Taxes" });
  await user.type(taxes, "99999999999999999");

  await click(user, "Create order with 1");

  await waitFor(() => expect(document.activeElement).toBe(taxes));
  expect(screen.getByText(MONEY_INPUT_HINT)).toBeDefined();
  expect(server.commits).toEqual([]);
});

// -------------------------------------------------------------------------------- Rows and fields

test("a row's Shipping Method goes on that row alone, and the rest keep the shared one", async () => {
  draft(ITEM_ID, OTHER_ID);
  const user = userEvent.setup();
  openAddPage("/add?to=collection");
  await rowsLoaded();
  await openDetails(user, "Rem");
  await chooseOption(user, "Shipping Method for Rem", "EMS");
  await click(user, "Add 2 to collection");

  await waitFor(() => expect(server.commits).toHaveLength(1));
  const rows = server.commits[0]?.rows ?? [];
  expect(rows.find(({ itemId }) => itemId === OTHER_ID)?.shippingMethod).toBe("EMS");
  expect(rows.find(({ itemId }) => itemId === ITEM_ID)?.shippingMethod).toBeUndefined();
  expect(server.commits[0]?.ownership.shared?.shippingMethod).toBe("n/a");
});

test("a row's Tags stop at 20, and each is at most 50 characters", async () => {
  draftWith(ITEM_ID, { tags: Array.from({ length: 19 }, (_, index) => `tag-${index}`) });
  const user = userEvent.setup();
  openAddPage("/add?to=collection");
  await openDetails(user, "Hatsune Miku");

  const input = () =>
    screen.getByRole("textbox", { name: "Tags for Hatsune Miku" }) as HTMLInputElement;
  expect(input().maxLength).toBe(50);
  expect(input().disabled).toBe(false);
  await user.type(input(), " last {Enter}");
  expect(screen.getByRole("button", { name: "Remove tag last" })).toBeDefined();
  expect(input().value).toBe("");
  expect(input().disabled).toBe(true);

  await click(user, "Remove tag tag-0");
  expect(input().disabled).toBe(false);
  await user.type(input(), "last{Enter}");
  expect(screen.getAllByRole("button", { name: "Remove tag last" })).toHaveLength(1);
});

test("the Shop and Notes fields hold to their limits, and a blank one sends nothing", async () => {
  draft(ITEM_ID);
  const user = userEvent.setup();
  openAddPage("/add?to=collection");
  await openDetails(user, "Hatsune Miku");
  const shop = screen.getByRole("textbox", { name: "Shop for Hatsune Miku" }) as HTMLInputElement;
  expect(shop.maxLength).toBe(200);
  expect(shop.placeholder).toBe("e.g., AmiAmi");
  expect(
    (screen.getByRole("textbox", { name: "Notes for Hatsune Miku" }) as HTMLTextAreaElement)
      .maxLength,
  ).toBe(5000);

  await click(user, "Add 1 to collection");
  await waitFor(() => expect(server.commits).toHaveLength(1));
  expect(server.commits[0]?.rows).toEqual([{ itemId: ITEM_ID, price: null }]);
});

test("a row's dates send, unset stays unset, and a cleared Collection Date sends null", async () => {
  draftWith(ITEM_ID, { collectionDate: null });
  const user = userEvent.setup();
  openAddPage("/add?to=collection");
  await openDetails(user, "Hatsune Miku");
  await pickDay(user, "Order Date for Hatsune Miku");
  await click(user, "Add 1 to collection");

  await waitFor(() => expect(server.commits).toHaveLength(1));
  const [row] = server.commits[0]?.rows ?? [];
  expect(row?.orderDate).toMatch(/^\d{4}-\d{2}-15$/u);
  expect(row?.paymentDate).toBeUndefined();
  expect(row?.shippingDate).toBeUndefined();
  expect(row?.collectionDate).toBeNull();
});

test("Count reads the shared Count until a row has its own, and clamps to 1 to 999", async () => {
  draft(ITEM_ID);
  openAddPage("/add?to=collection");
  await rowsLoaded();
  const count = screen.getByRole("spinbutton", {
    name: "Count for Hatsune Miku",
  }) as HTMLInputElement;
  expect(count.placeholder).toBe("1");
  fireEvent.change(count, { target: { value: "5000" } });
  expect(count.value).toBe("999");
  fireEvent.change(count, { target: { value: "" } });
  expect(count.value).toBe("");
});

test("a score sends, and clicking it again clears it to nothing", async () => {
  draft(ITEM_ID);
  const user = userEvent.setup();
  openAddPage("/add?to=collection");
  await openDetails(user, "Hatsune Miku");
  const score = () => within(screen.getByRole("group", { name: "Score for Hatsune Miku" }));
  const [, second] = score().getAllByRole("button");
  if (second === undefined) throw new Error("no stars to click");

  await user.click(second);
  await user.click(score().getByRole("button", { name: "2 stars" }));
  await click(user, "Add 1 to collection");
  await waitFor(() => expect(server.commits).toHaveLength(1));
  expect(server.commits[0]?.rows).toEqual([{ itemId: ITEM_ID, price: null }]);
});

test("what a row holds stays in the draft through the Item Database, and comes back", async () => {
  draftWith(ITEM_ID, { price: "12.50" });
  const user = userEvent.setup();
  openAddPage("/add?to=collection");
  await rowsLoaded();
  await destination(user, "Item Database");
  expect(screen.queryByRole("textbox", { name: "Price for Hatsune Miku" })).toBeNull();

  await destination(user, "Collection");
  const price = screen.getByRole("textbox", { name: "Price for Hatsune Miku" }) as HTMLInputElement;
  expect(price.value).toContain("12.50");
});

test("an open row closes while nothing is owned, and comes back with an owned choice", async () => {
  draft(ITEM_ID);
  const user = userEvent.setup();
  openAddPage("/add?to=collection");
  await openDetails(user, "Hatsune Miku");
  expect(screen.getByRole("textbox", { name: "Notes for Hatsune Miku" })).toBeDefined();

  await destination(user, "Item Database");
  expect(screen.queryByRole("textbox", { name: "Notes for Hatsune Miku" })).toBeNull();

  await destination(user, "Collection");
  expect(screen.getByRole("textbox", { name: "Notes for Hatsune Miku" })).toBeDefined();
});

test("Select all counts only rows with an Item, and shows some as indeterminate", async () => {
  server.items.delete(OTHER_ID);
  draft(ITEM_ID, OTHER_ID);
  seedItems(item("third0000001", { title: "Third" }));
  sessionStorage.setItem(
    DRAFT_KEY,
    JSON.stringify(
      [ITEM_ID, OTHER_ID, "third0000001"].map((itemId) => ({
        itemId,
        overrides: {},
        selected: true,
      })),
    ),
  );
  const user = userEvent.setup();
  openAddPage("/add?to=collection");
  await rowsLoaded();
  const all = () => screen.getByRole("checkbox", { name: "Select all items" });
  await waitFor(() => expect(all().getAttribute("aria-checked")).toBe("true"));

  await user.click(screen.getByRole("checkbox", { name: "Select Third" }));
  expect(all().getAttribute("aria-checked")).toBe("mixed");
  await screen.findByRole("button", { name: "Add 1 to collection" });

  await user.click(all());
  await screen.findByRole("button", { name: "Add 2 to collection" });
  await user.click(all());
  await screen.findByRole("button", { name: "Select items to add" });
});

test("a row still loading is a skeleton, and the commit waits for it", async () => {
  draft(ITEM_ID);
  let answer = () => {};
  server.itemsGate = new Promise<void>((resolve) => {
    answer = resolve;
  });
  openAddPage("/add?to=collection");

  await waitFor(() => expect(document.querySelector('tr[aria-hidden="true"]')).not.toBeNull());
  expect(screen.getByRole("button", { name: "Select items to add" }).hasAttribute("disabled")).toBe(
    true,
  );

  await act(async () => answer());
  await screen.findByRole("button", { name: "Add 1 to collection" });
  expect(document.querySelector('tr[aria-hidden="true"]')).toBeNull();
});

// ------------------------------------------------------------------------------------- Fill all

async function fill(user: User, field: string) {
  await click(user, "Fill all");
  await click(user, field);
}

test("Fill all writes one value to every selected row, and the shared value too", async () => {
  draft(ITEM_ID, OTHER_ID);
  const user = userEvent.setup();
  openAddPage("/add?to=collection");
  await rowsLoaded();

  await fill(user, "Shop");
  await user.type(await screen.findByRole("textbox", { name: "Shop" }), "AmiAmi");
  await click(user, "Fill 2 selected");
  await waitFor(() =>
    expect(
      screen
        .getAllByRole("status")
        .some(({ textContent }) => textContent === "Filled Shop on 2 selected"),
    ).toBe(true),
  );

  await click(user, "Add 2 to collection");
  await waitFor(() => expect(server.commits).toHaveLength(1));
  expect(server.commits[0]?.rows.map(({ shop }) => shop)).toEqual(["AmiAmi", "AmiAmi"]);
  expect(server.commits[0]?.ownership.shared?.shop).toBe("AmiAmi");
});

test("Fill all sets Condition, Count, Collection Date and Shipping Method for the Collection", async () => {
  draft(ITEM_ID);
  const user = userEvent.setup();
  openAddPage("/add?to=collection");
  await rowsLoaded();

  await fill(user, "Condition");
  await chooseOption(user, "Condition", "Pre-Owned");
  await click(user, "Fill 1 selected");

  await fill(user, "Count");
  fireEvent.change(await screen.findByRole("spinbutton", { name: "Count" }), {
    target: { value: "3" },
  });
  await click(user, "Fill 1 selected");

  await fill(user, "Shipping Method");
  await chooseOption(user, "Shipping Method", "EMS");
  await click(user, "Fill 1 selected");

  await fill(user, "Collection Date");
  await pickDay(user, "Collection Date");
  await click(user, "Fill 1 selected");

  await click(user, "Add 1 to collection");
  await waitFor(() => expect(server.commits).toHaveLength(1));
  const shared = server.commits[0]?.ownership.shared;
  expect(shared?.condition).toBe("Pre-Owned");
  expect(shared?.count).toBe(3);
  expect(String(shared?.collectionDate)).toMatch(/^\d{4}-\d{2}-15$/u);
  const [row] = server.commits[0]?.rows ?? [];
  expect(row?.shippingMethod).toBe("EMS");
  expect(row?.condition).toBe("Pre-Owned");
  expect(row?.count).toBe(3);
});

test("Fill all adds tags to what each row has, and says when it replaces values", async () => {
  sessionStorage.setItem(
    DRAFT_KEY,
    JSON.stringify([
      { itemId: ITEM_ID, overrides: { tags: ["old"], notes: "keep" }, selected: true },
      { itemId: OTHER_ID, overrides: {}, selected: true },
    ]),
  );
  const user = userEvent.setup();
  openAddPage("/add?to=collection");
  await rowsLoaded();

  await fill(user, "Tags");
  expect(screen.getByText("Adds to the tags each row already has.")).toBeDefined();
  await user.type(await screen.findByRole("textbox", { name: "Tags" }), "new{Enter}");
  await click(user, "Fill 2 selected");

  await fill(user, "Notes");
  expect(screen.getByText("Replaces the value in 1 row.")).toBeDefined();
  await click(user, "Fill 2 selected");

  await click(user, "Add 2 to collection");
  await waitFor(() => expect(server.commits).toHaveLength(1));
  const rows = server.commits[0]?.rows ?? [];
  expect(rows.find(({ itemId }) => itemId === ITEM_ID)?.tags).toEqual(["old", "new"]);
  expect(rows.find(({ itemId }) => itemId === OTHER_ID)?.tags).toEqual(["new"]);
});

test("Fill all asks for a selection before it offers a field", async () => {
  draft(ITEM_ID);
  const user = userEvent.setup();
  openAddPage("/add?to=collection");
  await rowsLoaded();
  await user.click(screen.getByRole("checkbox", { name: "Select Hatsune Miku" }));
  await click(user, "Fill all");
  await screen.findByText("Select items to fill.");
  expect(screen.getByRole("button", { name: "Shop" }).hasAttribute("disabled")).toBe(true);
});

test("Fill all offers an Order only what its Items can hold", async () => {
  draft(ITEM_ID);
  const user = userEvent.setup();
  openAddPage("/add?to=order-new");
  await rowsLoaded();
  await click(user, "Fill all");

  await screen.findByText("Write one value to 1 selected row.");
  const offered = document.querySelectorAll("[data-add-fill-list] button");
  expect([...offered].map(({ textContent }) => textContent)).toEqual([
    "Price",
    "Count",
    "Condition",
    "Score",
    "Tags",
    "Notes",
  ]);
});

// --------------------------------------------------------------------------------- Table keyboard

test("arrow keys walk the row's controls and keep the column, and Enter moves on", async () => {
  // happy-dom has no layout, so every control counts as visible.
  HTMLElement.prototype.checkVisibility = () => true;
  HTMLElement.prototype.scrollIntoView = () => {};
  draft(ITEM_ID, OTHER_ID);
  const user = userEvent.setup();
  openAddPage("/add?to=collection");
  await rowsLoaded();
  const top = screen.getAllByRole("textbox", { name: /^Price for/u })[0] as HTMLElement;
  const bottom = screen.getAllByRole("textbox", { name: /^Price for/u })[1] as HTMLElement;
  top.focus();
  await user.keyboard("{ArrowDown}");
  expect(document.activeElement === bottom).toBe(true);
  await user.keyboard("{ArrowUp}");
  expect(document.activeElement === top).toBe(true);

  await user.keyboard("{ArrowRight}");
  expect(document.activeElement?.getAttribute("type")).toBe("number");
  await user.keyboard("{ArrowLeft}");
  expect(document.activeElement === top).toBe(true);

  await user.keyboard("{Enter}");
  expect(document.activeElement?.getAttribute("type")).toBe("number");
});

test("Left and Right stay in the text until the caret reaches its end", async () => {
  draftWith(ITEM_ID, { price: "12" });
  const user = userEvent.setup();
  openAddPage("/add?to=collection");
  await rowsLoaded();
  const price = screen.getByRole("textbox", { name: "Price for Hatsune Miku" }) as HTMLInputElement;
  price.focus();
  price.setSelectionRange(1, 1);
  await user.keyboard("{ArrowRight}");
  expect(document.activeElement === price).toBe(true);
});

// ---------------------------------------------------------------------------- Commit in flight

test("nothing on the page can change while a commit is in flight, and its answer lets go", async () => {
  draft(ITEM_ID);
  const release = holdCommit();
  const user = userEvent.setup();
  openAddPage("/add?to=collection");
  await rowsLoaded();
  const box = screen.getByRole("combobox", { name: "Search the Item Database" });
  expect(box.closest("[inert]")).toBeNull();

  await click(user, "Add 1 to collection");
  await waitFor(() => expect(server.commits).toHaveLength(1));

  for (const control of [
    box,
    screen.getByRole("checkbox", { name: "Select Hatsune Miku" }),
    screen.getByRole("textbox", { name: "Price for Hatsune Miku" }),
    screen.getByRole("combobox", { name: "Where these go" }),
    screen.getByRole("button", { name: "Remove Hatsune Miku" }),
  ]) {
    expect(control.closest("[inert]")).not.toBeNull();
  }
  await user.click(screen.getByRole("button", { name: /Add 1 to collection/u }));
  expect(server.commits).toHaveLength(1);

  await release();
  await screen.findByText("Added 1 to your collection");
  expect(document.querySelector("[inert]")).toBeNull();
  expect(document.activeElement).toBe(
    screen.getByRole("combobox", { name: "Search the Item Database" }),
  );
});

test("a failed commit lets go of the page, and a retry keeps its commitId", async () => {
  draft(ITEM_ID);
  server.commitAnswer = async () => refused(503, "down");
  const user = userEvent.setup();
  openAddPage("/add?to=collection");
  await rowsLoaded();

  await click(user, "Add 1 to collection");
  await waitFor(() => expect(document.querySelector("[inert]")).toBeNull());
  await waitFor(() => expect(server.commits).toHaveLength(1));
  expect(screen.getByRole("checkbox", { name: "Select Hatsune Miku" })).toBeDefined();

  await click(user, /Add 1 to collection/u);
  await waitFor(() => expect(server.commits).toHaveLength(2));
  expect(server.commits[1]?.commitId).toBe(server.commits[0]?.commitId ?? "");
});

test("a commit that answers after 6.5 s still lands, with no timeout", async () => {
  draft(ITEM_ID);
  const release = holdCommit();
  const user = userEvent.setup();
  openAddPage("/add?to=collection");
  await rowsLoaded();

  await click(user, "Add 1 to collection");
  await pause(6600);
  expect(document.querySelector("[inert]")).not.toBeNull();
  expect(screen.queryByText(/Failed to add/u)).toBeNull();

  await release();
  await screen.findByText("Added 1 to your collection");
  expect(server.commits).toHaveLength(1);
});

test("the toast of a commit does not time out", async () => {
  draft(ITEM_ID);
  const user = userEvent.setup();
  openAddPage("/add?to=collection");
  await rowsLoaded();
  await click(user, "Add 1 to collection");
  await screen.findByText("Added 1 to your collection");

  await pause(6600);
  expect(screen.getByText("Added 1 to your collection")).toBeDefined();
});

test("a pick saved after a commit answers cannot bring its rows back on a reload", async () => {
  const extension = loadExtension({});
  seedItems(item("item-12345", { title: "New pick" }));
  draft(ITEM_ID);
  let release = () => {};
  server.uploadAnswer = async () => {
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    return { data: { saved: "created", itemId: "item-12345", mfcItemId: 12_345 }, error: null };
  };
  const user = userEvent.setup();
  openAddPage("/add?to=collection");
  await rowsLoaded();
  extension.setPicks([fakePick(12_345)]);
  act(() => {
    window.dispatchEvent(new Event("focus"));
  });
  await waitFor(() => expect(server.uploads).toHaveLength(1));

  await click(user, "Add 1 to collection");
  await waitFor(() => expect(sessionStorage.getItem(DRAFT_KEY)).toBe("[]"));

  await act(async () => release());
  await waitFor(() => expect(sessionStorage.getItem(DRAFT_KEY)).toContain("item-12345"));
  expect(sessionStorage.getItem(DRAFT_KEY)).not.toContain(ITEM_ID);
  cleanup();

  openAddPage("/add");
  await screen.findByRole("checkbox", { name: "Select New pick" });
  expect(screen.queryByRole("checkbox", { name: "Select Hatsune Miku" })).toBeNull();
});

test("an Item added again after its commit is kept in the draft", async () => {
  draft(ITEM_ID);
  const user = userEvent.setup();
  openAddPage("/add?to=collection");
  await rowsLoaded();
  await click(user, "Add 1 to collection");
  await waitFor(() => expect(sessionStorage.getItem(DRAFT_KEY)).toBe("[]"));

  await user.type(screen.getByRole("combobox", { name: "Search the Item Database" }), "Hatsune");
  await user.click(await screen.findByRole("option", { name: /Hatsune Miku/u }));

  await waitFor(() => expect(sessionStorage.getItem(DRAFT_KEY)).toContain(ITEM_ID));
});

test("a commit resets the form to its preset, with issues gone", async () => {
  draft(ITEM_ID, OTHER_ID);
  const user = userEvent.setup();
  openAddPage("/add");
  await rowsLoaded();
  await user.click(screen.getByRole("checkbox", { name: "Select Rem" }));
  await destination(user, "Collection");
  await click(user, "Add 1 to collection");

  await screen.findByText("Added 1 to your collection");
  await waitFor(() =>
    expect(screen.getByRole("combobox", { name: "Where these go" }).textContent).toBe(
      "choose where",
    ),
  );
});

// ---------------------------------------------------------------------- Rows, storage and search

test("rows live in sessionStorage, so another tab, like a closed one reopened, has no draft", async () => {
  draft(ITEM_ID);
  openAddPage();
  await rowsLoaded();
  expect(sessionStorage.getItem(DRAFT_KEY)).toContain(ITEM_ID);
  expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
  cleanup();

  sessionStorage.clear();
  openAddPage();
  await screen.findByText("Pick items on MyFigureCollection");
  expect(screen.queryByRole("checkbox", { name: "Select Hatsune Miku" })).toBeNull();
});

test("?q= starts the search", async () => {
  openAddPage("/add?q=miku");
  const box = await screen.findByRole("combobox", { name: "Search the Item Database" });
  expect((box as HTMLInputElement).value).toBe("miku");
});

test("a full page says so, in a status region too, and removing a row clears it", async () => {
  sessionStorage.setItem(
    DRAFT_KEY,
    JSON.stringify(
      Array.from({ length: 100 }, (_, index) => ({
        itemId: `row${String(index).padStart(9, "0")}`,
        overrides: {},
        selected: true,
      })),
    ),
  );
  const user = userEvent.setup();
  openAddPage();
  const box = await screen.findByRole("combobox", { name: "Search the Item Database" });
  await user.type(box, "miku");
  await screen.findByRole("option", { name: /Hatsune Miku/u });
  await waitFor(() => expect(screen.getByRole("listbox").getAttribute("aria-busy")).toBe("false"));
  await user.keyboard("{Enter}");

  await screen.findByText(/This page holds 100 items at a time\. Add these first/u);
  expect(
    screen
      .getAllByRole("status")
      .some(({ textContent }) => textContent === "This page holds 100 items at a time."),
  ).toBe(true);

  await user.click(screen.getAllByRole("button", { name: "Remove this row" })[0] as HTMLElement);
  await waitFor(() => expect(screen.queryByText(/Add these first/u)).toBeNull());
});

test("the search says how many it found, and aria-expanded follows the panel", async () => {
  const user = userEvent.setup();
  openAddPage();
  const box = await screen.findByRole("combobox", { name: "Search the Item Database" });
  expect(box.getAttribute("aria-expanded")).toBe("false");

  await user.type(box, "miku");
  await screen.findByRole("option", { name: /Hatsune Miku/u });
  await waitFor(() => expect(box.getAttribute("aria-expanded")).toBe("true"));
  await waitFor(() =>
    expect(
      screen.getAllByRole("status").some(({ textContent }) => textContent === "1 item found"),
    ).toBe(true),
  );

  await user.keyboard("{Escape}");
  await waitFor(() => expect(box.getAttribute("aria-expanded")).toBe("false"));
  expect(screen.queryByRole("listbox")).toBeNull();
});

test("View on a single Done Item opens that Item's page", async () => {
  draft(ITEM_ID);
  const user = userEvent.setup();
  const router = openAddPage("/add?to=none");
  await rowsLoaded();
  await click(user, "Done");

  await screen.findByText("This item is in the Item Database");
  const notifications = screen.getByRole("region", { name: /Notifications/u });
  await user.click(within(notifications).getByRole("button", { name: "View" }));
  await waitFor(() => expect(router.state.location.pathname).toBe("/item/98777"));
});

// ------------------------------------------------------------------------------------- Picks

test("a pick arrives on window focus and on the tab showing, and a hidden tab takes nothing", async () => {
  seedItems(item("item-98777", { title: "Picked Miku", externalId: 98_777 }));
  const extension = loadExtension({});
  openAddPage();
  await screen.findByText("Pick items on MyFigureCollection");
  const takes = () =>
    extension.posted.filter(({ message }) => message.request.type === "take-picks").length;
  await waitFor(() => expect(takes()).toBe(1));

  extension.setPicks([fakePick(98_777, "Picked Miku")]);
  const visibility = Object.getOwnPropertyDescriptor(Document.prototype, "visibilityState");
  const showing = (state: "visible" | "hidden") =>
    Object.defineProperty(document, "visibilityState", { configurable: true, value: state });

  showing("hidden");
  act(() => {
    document.dispatchEvent(new Event("visibilitychange"));
    window.dispatchEvent(new Event("focus"));
  });
  await pause(100);
  expect(server.uploads).toEqual([]);
  expect(screen.queryByRole("checkbox", { name: "Select Picked Miku" })).toBeNull();

  showing("visible");
  act(() => {
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await screen.findByRole("checkbox", { name: "Select Picked Miku" });
  expect(server.uploads).toEqual([98_777]);

  seedItems(item("item-112233", { title: "Picked Rem", externalId: 112_233 }));
  extension.setPicks([fakePick(112_233, "Picked Rem")]);
  act(() => {
    window.dispatchEvent(new Event("focus"));
  });
  await screen.findByRole("checkbox", { name: "Select Picked Rem" });
  expect(server.uploads).toEqual([98_777, 112_233]);
  if (visibility) delete (document as { visibilityState?: unknown }).visibilityState;
});

test("a rejected pick shows the server's own message, Retry, Discard and the MFC link", async () => {
  server.uploadAnswer = async () => refused(400, "This page is not an item we can read.");
  loadExtension({ picks: [fakePick(98_777, "Picked Miku")] });
  openAddPage();

  await screen.findByText("This page is not an item we can read.");
  expect(screen.getByRole("button", { name: "Retry Picked Miku" })).toBeDefined();
  expect(screen.getByRole("button", { name: "Discard Picked Miku" })).toBeDefined();
  expect(screen.getByRole("link", { name: "Open on MFC" }).getAttribute("href")).toBe(
    "https://myfigurecollection.net/item/98777",
  );
});

test("a pick with no title reads as its MFC item, and a failed Discard says so in a toast", async () => {
  server.uploadAnswer = async () => refused(503, "down");
  const extension = loadExtension({ picks: [fakePick(98_777, null)] });
  const user = userEvent.setup();
  openAddPage();

  await screen.findByText("MFC item #98777");
  await screen.findByRole("button", { name: "Discard MFC item #98777" });
  extension.setInstalled(false);
  await click(user, "Discard MFC item #98777");

  await screen.findByRole("button", { name: "Discard MFC item #98777" });
  await waitFor(() =>
    expect(
      within(screen.getByRole("region", { name: /Notifications/u })).getByText(
        "The extension stopped. Reload the page to see your picks.",
      ),
    ).toBeDefined(),
  );
});
