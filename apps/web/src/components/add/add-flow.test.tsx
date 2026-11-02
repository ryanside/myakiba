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
import { flushSync } from "react-dom";
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
  await user.click(screen.getByRole("option", { name: "New Order" }));
  await waitFor(() =>
    expect(screen.getByRole("combobox", { name: "Where these go" }).textContent).toBe("New Order"),
  );
});

test("typing in Price and Count holds focus and every character", async () => {
  draft(ITEM_ID);
  const user = userEvent.setup();
  openAddPage("/add?to=collection");
  await rowsLoaded();

  const price = screen.getByRole<HTMLInputElement>("textbox", { name: "Price for Hatsune Miku" });
  await user.click(price);
  for (const digit of "1234") {
    await user.keyboard(digit);
    expect(document.activeElement).toBe(price);
    expect(price.isConnected).toBe(true);
  }
  expect(price.value).toBe("$1,234");

  const count = screen.getByRole<HTMLInputElement>("spinbutton", {
    name: "Count for Hatsune Miku",
  });
  await user.click(count);
  await user.keyboard("12");
  expect(document.activeElement).toBe(count);
  expect(count.value).toBe("12");
});

test("clicking a row's empty space opens its details, and its controls do not", async () => {
  draft(ITEM_ID);
  const user = userEvent.setup();
  openAddPage("/add?to=collection");
  await rowsLoaded();
  const details = () => screen.queryByRole("group", { name: "Details for Hatsune Miku" });

  await user.click(screen.getByRole("textbox", { name: "Price for Hatsune Miku" }));
  await user.click(screen.getByRole("checkbox", { name: "Select Hatsune Miku" }));
  await user.click(screen.getByRole("checkbox", { name: "Select Hatsune Miku" }));
  await chooseOption(user, "Condition for Hatsune Miku", "Pre-Owned");
  expect(details()).toBeNull();

  const row = screen.getByRole("textbox", { name: "Price for Hatsune Miku" }).closest("tr");
  await user.click(row?.querySelector('[data-col="item"]') as Element);
  expect(details()).not.toBeNull();
  await user.click(row?.querySelector('[data-col="item"]') as Element);
  expect(details()).toBeNull();
});

test("with nothing chosen, a row's empty space does nothing", async () => {
  draft(ITEM_ID);
  const user = userEvent.setup();
  openAddPage("/add");
  await rowsLoaded();
  const row = screen.getByRole("textbox", { name: "Price for Hatsune Miku" }).closest("tr");
  await user.click(row?.querySelector('[data-col="item"]') as Element);
  expect(screen.queryByRole("group", { name: "Details for Hatsune Miku" })).toBeNull();
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

test("the button keeps them in the Item Database with nothing else named, and no mid dot anywhere", async () => {
  draft(ITEM_ID);
  server.lists.push({ id: "shelf0000001", title: "Display shelf" });
  const user = userEvent.setup();
  openAddPage("/add?to=none");
  await rowsLoaded();
  expect(screen.getByRole("button", { name: "Keep 1 in Item Database" })).toBeDefined();
  expect(screen.queryByText(/nothing to save/u)).toBeNull();

  await user.click(screen.getByRole("checkbox", { name: "Wishlist" }));
  await user.click(screen.getByRole("button", { name: "Lists" }));
  await user.click(await screen.findByRole("checkbox", { name: "Display shelf" }));
  await user.keyboard("{Escape}");
  expect(
    screen.getByRole("button", { name: "Add 1 to Wishlist and ‘Display shelf’" }),
  ).toBeDefined();
  expect(document.body.textContent).not.toContain("·");
});

test("trying another destination keeps what was typed, New and Existing Order included", async () => {
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
  expect((screen.getByRole("textbox", { name: "Shop" }) as HTMLInputElement).value).toBe("AmiAmi");
});

test("a commit starts the next Order clean, whichever kind was tried before it", async () => {
  draft(ITEM_ID, OTHER_ID);
  const user = userEvent.setup();
  openAddPage("/add?to=order-new");
  await rowsLoaded();
  await user.type(screen.getByRole("textbox", { name: "Shop" }), "AmiAmi");
  await user.click(screen.getByRole("checkbox", { name: "Select Rem" }));
  await click(user, "Create order with 1");
  await screen.findByText("Created order");
  await user.click(await screen.findByRole("checkbox", { name: "Select Rem" }));
  await waitFor(() =>
    expect((screen.getByRole("textbox", { name: "Shop" }) as HTMLInputElement).value).toBe(""),
  );
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
  expect(order.getByRole("button", { name: "Edit Order title" })).toBeDefined();
  for (const group of ["Basics", "Dates", "Costs"]) {
    expect(order.getByRole("group", { name: group })).toBeDefined();
    expect(order.queryByText(group)).toBeNull();
  }
});

test("typing on the prefilled Order title replaces it, and a cleared one falls back", async () => {
  draft(ITEM_ID, OTHER_ID);
  const user = userEvent.setup();
  openAddPage("/add?to=order-new");
  await rowsLoaded();
  const preview = screen.getByRole("button", { name: "Edit Order title" });
  expect(preview.textContent).toBe("Hatsune Miku + 1 more");

  await user.click(preview);
  await user.keyboard("Spring preorders{Enter}");
  expect(screen.getByRole("button", { name: "Edit Order title" }).textContent).toBe(
    "Spring preorders",
  );

  await user.click(screen.getByRole("button", { name: "Edit Order title" }));
  await user.clear(screen.getByRole("textbox", { name: "Order title" }));
  await user.keyboard("{Enter}");
  expect(screen.getByRole("button", { name: "Edit Order title" }).textContent).toBe(
    "Hatsune Miku + 1 more",
  );
  await click(user, "Create order with 2");
  await screen.findByText("Created order");
  expect(server.commits[0]?.ownership.order?.fields?.title).toBe("Hatsune Miku + 1 more");
});

test("Enter and Escape in the Order title keep focus on it, without reopening it", async () => {
  draft(ITEM_ID);
  const user = userEvent.setup();
  openAddPage("/add?to=order-new");
  await rowsLoaded();
  const focusedOnPreview = () =>
    document.activeElement === screen.queryByRole("button", { name: "Edit Order title" });

  await user.click(screen.getByRole("button", { name: "Edit Order title" }));
  await user.keyboard("Spring{Enter}");
  await waitFor(() => expect(focusedOnPreview()).toBe(true));
  expect(screen.queryByRole("textbox", { name: "Order title" })).toBeNull();

  await user.click(screen.getByRole("button", { name: "Edit Order title" }));
  await user.keyboard("Discarded{Escape}");
  await waitFor(() => expect(focusedOnPreview()).toBe(true));
  expect(screen.getByRole("button", { name: "Edit Order title" }).textContent).toBe("Spring");

  await user.keyboard("{Enter}");
  expect(await screen.findByRole("textbox", { name: "Order title" })).toBeDefined();
});

test("the Order title saves when focus leaves it, and Escape keeps the one it had", async () => {
  draft(ITEM_ID);
  const user = userEvent.setup();
  openAddPage("/add?to=order-new");
  await rowsLoaded();
  await user.click(screen.getByRole("button", { name: "Edit Order title" }));
  await user.keyboard("Discarded{Escape}");
  expect(screen.getByRole("button", { name: "Edit Order title" }).textContent).toBe("Hatsune Miku");
  await user.click(screen.getByRole("button", { name: "Edit Order title" }));
  await user.keyboard("Spring");
  await click(user, "Create order with 1");
  await waitFor(() => expect(server.commits).toHaveLength(1));
  expect(server.commits[0]?.ownership.order?.fields?.title).toBe("Spring");
});

test("New Order's fees and title reach the commit", async () => {
  draft(ITEM_ID);
  const user = userEvent.setup();
  openAddPage("/add?to=order-new");
  await rowsLoaded();
  await user.type(screen.getByRole("textbox", { name: "Taxes" }), "12.50");
  await screen.findByText("Fees $12.50");
  await click(user, "Create order with 1");
  await screen.findByText("Created order");
  await screen.findByText("Hatsune Miku");

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
  expect(screen.getByRole("combobox", { name: "Order" }).textContent).toContain("Spring order");
  await click(user, "Add 1 to order");
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

test("a release in another currency says nothing about converting it", async () => {
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

  expect(document.body.textContent).not.toMatch(/convert|currenc/iu);
});

test("a commit points at a price the page cannot read", async () => {
  draftWith(ITEM_ID, { price: "1.234" });
  const user = userEvent.setup();
  openAddPage("/add?to=collection");
  await rowsLoaded();

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
  expect(shop.placeholder).toBe("Enter shop name");
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

  await waitFor(() =>
    expect(document.querySelector('tbody [data-slot="skeleton"]')).not.toBeNull(),
  );
  expect(screen.getByRole("button", { name: "Add 1 to collection" }).hasAttribute("disabled")).toBe(
    true,
  );

  await act(async () => answer());
  await screen.findByRole("checkbox", { name: "Select Hatsune Miku" });
  expect(screen.getByRole("button", { name: "Add 1 to collection" }).hasAttribute("disabled")).toBe(
    false,
  );
  expect(document.querySelector('tbody [data-slot="skeleton"]')).toBeNull();
});

// ------------------------------------------------------------------------------------- Fill all

async function fill(user: User, field: string) {
  await click(user, "Fill all");
  await user.click(
    within(screen.getByRole("dialog", { name: "Fill all" })).getByRole("button", { name: field }),
  );
  // The popup holds focus for a moment before the field takes it, and keys typed then are lost.
  await waitFor(() => expect(document.activeElement?.id.startsWith("add-fill-")).toBe(true));
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

test("Fill selected leaves an unselected row's values alone", async () => {
  draft(ITEM_ID, OTHER_ID);
  const user = userEvent.setup();
  openAddPage("/add?to=collection");
  await rowsLoaded();
  await user.click(screen.getByRole("checkbox", { name: "Select Hatsune Miku" }));

  await fill(user, "Count");
  fireEvent.change(await screen.findByRole("spinbutton", { name: "Count" }), {
    target: { value: "3" },
  });
  await click(user, "Fill 1 selected");
  await fill(user, "Shop");
  await user.type(await screen.findByRole("textbox", { name: "Shop" }), "AmiAmi");
  await click(user, "Fill 1 selected");

  await user.click(screen.getByRole("checkbox", { name: "Select Hatsune Miku" }));
  await click(user, "Add 2 to collection");
  await waitFor(() => expect(server.commits).toHaveLength(1));
  const shared = server.commits[0]?.ownership.shared;
  expect(shared?.count).toBe(1);
  expect(shared?.shop).toBe("");
  const rows = server.commits[0]?.rows ?? [];
  const filled = rows.find(({ itemId }) => itemId === OTHER_ID);
  const left = rows.find(({ itemId }) => itemId === ITEM_ID);
  expect(filled?.count).toBe(3);
  expect(filled?.shop).toBe("AmiAmi");
  expect(left?.count).toBeUndefined();
  expect(left?.shop).toBeUndefined();
});

test("Fill all refuses tags that would take a row past 20, and says so", async () => {
  const tags = Array.from({ length: 20 }, (_, index) => `tag-${index}`);
  sessionStorage.setItem(
    DRAFT_KEY,
    JSON.stringify([
      { itemId: ITEM_ID, overrides: { tags }, selected: true },
      { itemId: OTHER_ID, overrides: {}, selected: true },
    ]),
  );
  const user = userEvent.setup();
  openAddPage("/add?to=collection");
  await rowsLoaded();

  await fill(user, "Tags");
  const field = await screen.findByRole("textbox", { name: "Tags" });
  await user.type(field, "tag-0{Enter}");
  expect(screen.getByRole<HTMLButtonElement>("button", { name: "Fill 2 selected" }).disabled).toBe(
    false,
  );
  await user.type(field, "extra{Enter}");
  expect(screen.getByText("1 row would have more than 20 tags.")).toBeDefined();
  expect(field.getAttribute("aria-invalid")).toBe("true");
  expect(field.getAttribute("aria-describedby")).toBe(
    screen.getByText("1 row would have more than 20 tags.").id,
  );
  expect(screen.getByRole<HTMLButtonElement>("button", { name: "Fill 2 selected" }).disabled).toBe(
    true,
  );
});

test("a failed commit's message stays until it's dismissed", async () => {
  draft(ITEM_ID);
  server.commitAnswer = async () => refused(503, "down");
  const user = userEvent.setup();
  openAddPage("/add?to=collection");
  await rowsLoaded();
  await click(user, "Add 1 to collection");
  await screen.findByText("Failed to add the items");
  await pause(5600);
  expect(screen.getByText("Failed to add the items")).toBeDefined();
});

test("every popup is named, and so is the Order search", async () => {
  draft(ITEM_ID);
  const user = userEvent.setup();
  openAddPage("/add?to=collection");
  await rowsLoaded();
  await click(user, "Fill all");
  expect(await screen.findByRole("dialog", { name: "Fill all" })).toBeDefined();
  await user.keyboard("{Escape}");
  await user.click(screen.getByRole("button", { name: /^Lists/u }));
  expect(await screen.findByRole("dialog", { name: "Lists" })).toBeDefined();
  await user.keyboard("{Escape}");
  await destination(user, "Existing Order");
  await user.click(await screen.findByRole("combobox", { name: "Order" }));
  expect(await screen.findByRole("dialog", { name: "Choose an Order" })).toBeDefined();
  expect(await screen.findByRole("combobox", { name: "Search Orders by title" })).toBeDefined();
});

test("removing a tag keeps focus in the Tags field", async () => {
  sessionStorage.setItem(
    DRAFT_KEY,
    JSON.stringify([{ itemId: ITEM_ID, overrides: { tags: ["old"] }, selected: true }]),
  );
  const user = userEvent.setup();
  openAddPage("/add?to=collection");
  await rowsLoaded();
  await openDetails(user, "Hatsune Miku");
  const field = screen.getByRole("textbox", { name: "Tags for Hatsune Miku" });
  await user.click(screen.getByRole("button", { name: "Remove tag old" }));
  // A comparison of booleans, because a failing comparison of elements prints the whole page.
  await waitFor(() => expect(document.activeElement === field).toBe(true));
});

test("the commit toast's View and Close are both there for assistive technology", async () => {
  draft(ITEM_ID);
  const user = userEvent.setup();
  openAddPage("/add?to=collection");
  await rowsLoaded();
  await click(user, "Add 1 to collection");
  await screen.findByText("Added 1 to your collection");
  const notifications = within(screen.getByRole("region", { name: /Notifications/u }));
  expect(notifications.getByRole("button", { name: "View" })).toBeDefined();
  expect(notifications.getByRole("button", { name: "Close toast" })).toBeDefined();
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
  const searchButton = screen.getByRole("button", { name: "Search myakiba" });
  expect(searchButton.closest("[inert]")).toBeNull();

  await click(user, "Add 1 to collection");
  await waitFor(() => expect(server.commits).toHaveLength(1));

  for (const control of [
    searchButton,
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
  expect(document.activeElement).toBe(searchButton);
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

test("the toast of a commit dismisses itself", async () => {
  draft(ITEM_ID);
  const user = userEvent.setup();
  openAddPage("/add?to=collection");
  await rowsLoaded();
  await click(user, "Add 1 to collection");
  await screen.findByText("Added 1 to your collection");

  // waitFor's check on every DOM change starves this with the commit button's animation running.
  await pause(6500);
  expect(screen.queryByText("Added 1 to your collection")).toBeNull();
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
  let answer = () => {};
  const { commitAnswer } = server;
  server.commitAnswer = async (body) => {
    await new Promise<void>((resolve) => {
      answer = resolve;
    });
    return commitAnswer(body);
  };
  const user = userEvent.setup();
  openAddPage("/add?to=collection");
  await rowsLoaded();
  await click(user, "Add 1 to collection");
  await waitFor(() => expect(server.commits).toHaveLength(1));
  extension.setPicks([fakePick(12_345)]);
  act(() => {
    window.dispatchEvent(new Event("focus"));
  });
  await waitFor(() => expect(server.uploads).toHaveLength(1));

  await act(async () => answer());
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

  await click(user, "Search myakiba");
  await user.type(await screen.findByRole("combobox", { name: "Search myakiba" }), "Hatsune");
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
  await screen.findByText("No items yet");
  expect(screen.queryByRole("checkbox", { name: "Select Hatsune Miku" })).toBeNull();
});

test("a letter typed as the search's room changes is kept", async () => {
  const realRect = HTMLElement.prototype.getBoundingClientRect;
  let bottom = 900;
  HTMLElement.prototype.getBoundingClientRect = function getBoundingClientRect() {
    const rect = realRect.call(this);
    if (this.dataset.addPane === undefined) return rect;
    bottom += 50;
    return { ...rect.toJSON(), bottom };
  };
  try {
    const user = userEvent.setup();
    openAddPage();
    await user.click(await screen.findByRole("button", { name: "Search myakiba" }));
    const box = (await screen.findByRole("combobox", {
      name: "Search myakiba",
    })) as HTMLInputElement;
    // A browser runs microtasks between a typed event's listeners, so React renders what an earlier
    // listener set before the input's own. A test's event runs them in one go, so this does it.
    box.parentElement?.addEventListener("input", () => flushSync(() => {}), { capture: true });
    await user.type(box, "stark");
    expect(box.value).toBe("stark");
  } finally {
    HTMLElement.prototype.getBoundingClientRect = realRect;
  }
});

test("?q= opens the search with its words, and focus in it", async () => {
  openAddPage("/add?q=miku");
  const box = await screen.findByRole("combobox", { name: "Search myakiba" });
  expect((box as HTMLInputElement).value).toBe("miku");
  await waitFor(() => expect(document.activeElement).toBe(box));
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
  await user.click(await screen.findByRole("button", { name: "Search myakiba" }));
  const box = await screen.findByRole("combobox", { name: "Search myakiba" });
  await user.type(box, "miku");
  await screen.findByRole("option", { name: /Hatsune Miku/u });
  await waitFor(() => expect(screen.getByRole("listbox").getAttribute("aria-busy")).toBe("false"));
  await user.keyboard("{Enter}");
  await user.keyboard("{Escape}");

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
  await user.click(await screen.findByRole("button", { name: "Search myakiba" }));
  const box = await screen.findByRole("combobox", { name: "Search myakiba" });
  expect(box.getAttribute("aria-expanded")).toBe("false");

  await user.type(box, "miku");
  await screen.findByRole("option", { name: /Hatsune Miku/u });
  await waitFor(() => expect(box.getAttribute("aria-expanded")).toBe("true"));
  await waitFor(() =>
    expect(
      screen.getAllByRole("status").some(({ textContent }) => textContent === "1 item found"),
    ).toBe(true),
  );

  await user.clear(box);
  await waitFor(() => expect(box.getAttribute("aria-expanded")).toBe("false"));
  expect(screen.queryByRole("listbox")).toBeNull();
});

test("View on a single kept Item opens that Item's page", async () => {
  draft(ITEM_ID);
  const user = userEvent.setup();
  const router = openAddPage("/add?to=none");
  await rowsLoaded();
  await click(user, "Keep 1 in Item Database");

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
  await screen.findByText("No items yet");
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

test("a failed retry shows its new reason on the row, and Discard removes the pick", async () => {
  server.uploadAnswer = async () => refused(503, "down");
  const extension = loadExtension({ picks: [fakePick(98_777, "Picked Miku")] });
  const user = userEvent.setup();
  openAddPage();
  await screen.findByText("myakiba could not save this item.");

  server.uploadAnswer = async () => refused(429, "slow down");
  await click(user, "Retry Picked Miku");
  await screen.findByText(/added a lot of items this hour/u);

  await click(user, "Discard Picked Miku");
  await waitFor(() => expect(screen.queryByText("Picked Miku")).toBeNull());
  expect(extension.acknowledged).toEqual([{ type: "picks-discarded", mfcItemIds: [98_777] }]);
});

test("picks list after rows, where a saved one lands, and a saving one counts as a row", async () => {
  const held: (() => void)[] = [];
  server.uploadAnswer = async () => {
    await new Promise<void>((resolve) => {
      held.push(resolve);
    });
    return refused(503, "down");
  };
  loadExtension({ picks: [fakePick(98_777, "Picked Miku")] });
  openAddPage();

  await screen.findByText("Saving…");
  expect(screen.getByRole("combobox", { name: "Where these go" }).hasAttribute("disabled")).toBe(
    false,
  );
  expect(
    screen.getByRole("button", { name: "Choose where these go" }).hasAttribute("disabled"),
  ).toBe(true);
  expect(screen.queryByText("No items yet")).toBeNull();
  cleanup();

  draft(ITEM_ID);
  loadExtension({ picks: [fakePick(112_233, "Another pick")] });
  openAddPage();
  await screen.findByText("Another pick");
  await rowsLoaded();
  const [first, second] = document.querySelectorAll("tbody tr");
  expect(first?.textContent).toContain("Hatsune Miku");
  expect(second?.textContent).toContain("Another pick");
  await act(async () => {
    for (const release of held) release();
  });
});

const announced = (text: string) =>
  waitFor(() =>
    expect(screen.getAllByRole("status").some(({ textContent }) => textContent === text)).toBe(
      true,
    ),
  );

test("what changes on the page is announced", async () => {
  seedItems(item("item-98777", { title: "Picked Miku", externalId: 98_777 }));
  loadExtension({ picks: [fakePick(98_777, "Picked Miku")] });
  const user = userEvent.setup();
  openAddPage();
  await screen.findByRole("checkbox", { name: "Select Picked Miku" });
  await announced("A picked item is ready to add");

  await click(user, "Search myakiba");
  const box = await screen.findByRole("combobox", { name: "Search myakiba" });
  await user.type(box, "Rem");
  await user.click(await screen.findByRole("option", { name: /^Rem/u }));
  await announced("Added Rem");
  await user.keyboard("{Escape}");

  await click(user, "Remove Rem");
  await announced("Removed Rem");
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "Remove Picked Miku" }));

  await click(user, "Remove Picked Miku");
  await announced("Removed Picked Miku");
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "Search myakiba" }));
});

test("a row's title links to its Item, and its picture skips the tab order", async () => {
  draft(ITEM_ID);
  openAddPage("/add?to=collection");
  await rowsLoaded();

  const title = screen.getByRole("link", { name: "Hatsune Miku" });
  expect(title.getAttribute("href")).toBe("/item/98777");
  expect(title.getAttribute("title")).toBe("Hatsune Miku");
  const picture = document.querySelector('a[tabindex="-1"][aria-hidden="true"]');
  expect(picture?.getAttribute("href")).toBe("/item/98777");
});

test("a typed zero differs from a blank price, and Not owned sends bare rows", async () => {
  draftWith(ITEM_ID, { price: "0" });
  const user = userEvent.setup();
  openAddPage("/add?to=collection");
  await rowsLoaded();
  await click(user, "Add 1 to collection");
  await waitFor(() => expect(server.commits).toHaveLength(1));
  expect(server.commits[0]?.rows[0]?.price).toBe(0);
  cleanup();

  draftWith(ITEM_ID, { price: "12.50", count: 4, shop: "AmiAmi", shippingMethod: "EMS" });
  openAddPage("/add?to=wishlist");
  await rowsLoaded();
  await click(user, "Add 1 to Wishlist");
  await waitFor(() => expect(server.commits).toHaveLength(2));
  expect(server.commits[1]?.rows).toEqual([{ itemId: ITEM_ID, price: null }]);
});

test("the commit's label is the plan, with the whole of it in its title, and no Order's title", async () => {
  server.orders.set("spring000001", "Spring order");
  draft(ITEM_ID);
  openAddPage("/add?to=order:spring000001");
  await rowsLoaded();
  await waitFor(() =>
    expect(screen.getByRole("combobox", { name: "Order" }).textContent).toContain("Spring order"),
  );
  const button = screen.getByRole("button", { name: "Add 1 to order" });
  const label = button.querySelector('[title="Add 1 to order"]');
  expect(label?.className.split(/\s+/u)).toContain("truncate");
});

test("New Order's own fields hold to their limits and defaults", async () => {
  draft(ITEM_ID);
  const user = userEvent.setup();
  openAddPage("/add?to=order-new");
  await rowsLoaded();
  const shop = screen.getByRole("textbox", { name: "Shop" }) as HTMLInputElement;
  expect(shop.maxLength).toBe(200);
  expect(shop.placeholder).toBe("Enter shop name");
  expect(screen.getByRole("combobox", { name: "Status" }).textContent).toBe("Ordered");
  expect(screen.getByRole("combobox", { name: "Shipping Method" }).textContent).toBe("n/a");
  for (const fee of ["Shipping Fee", "Taxes", "Duties", "Tariffs", "Miscellaneous Fees"]) {
    expect(screen.getByRole("textbox", { name: fee }).getAttribute("placeholder")).toBe("0.00");
  }
  await user.type(screen.getByRole("textbox", { name: "Notes" }), "Bundle");
  await click(user, "Create order with 1");
  await waitFor(() => expect(server.commits).toHaveLength(1));
  const fields = server.commits[0]?.ownership.order?.fields ?? {};
  expect(fields.notes).toBe("Bundle");
  expect(fields.shippingFee).toBe(0);
  expect(fields.miscFees).toBe(0);
});

test("the Order picker reads Loading while a preset's title loads, and says when it cannot search", async () => {
  server.orders.set("spring000001", "Spring order");
  let answer = () => {};
  server.orderGate = new Promise<void>((resolve) => {
    answer = resolve;
  });
  draft(ITEM_ID);
  const user = userEvent.setup();
  openAddPage("/add?to=order:spring000001");
  const picker = await screen.findByRole("combobox", { name: "Order" });
  expect(picker.textContent).toContain("Loading the Order…");
  await act(async () => answer());
  await waitFor(() => expect(picker.textContent).toContain("Spring order"));
  cleanup();

  server.ordersFailure = refused(503, "down");
  draft(ITEM_ID);
  openAddPage("/add?to=order:missing00001");
  const failing = await screen.findByRole("combobox", { name: "Order" });
  await user.click(failing);
  await screen.findByText("Couldn't load your Orders. Try again.");
});

test("Show more Orders pages, and a chosen Order closes the picker", async () => {
  for (let index = 0; index < 21; index += 1) {
    server.orders.set(`order${String(index).padStart(7, "0")}`, `Order ${index}`);
  }
  draft(ITEM_ID);
  const user = userEvent.setup();
  openAddPage("/add?to=collection");
  await rowsLoaded();
  await destination(user, "Existing Order");
  await user.click(screen.getByRole("combobox", { name: "Order" }));

  await screen.findByRole("option", { name: "Order 19" });
  expect(screen.queryByRole("option", { name: "Order 20" })).toBeNull();
  await user.click(screen.getByRole("option", { name: "Show more Orders" }));
  await user.click(await screen.findByRole("option", { name: "Order 20" }));

  await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull());
  await waitFor(() =>
    expect(screen.getByRole("combobox", { name: "Order" }).textContent).toContain("Order 20"),
  );
  await screen.findByRole("button", { name: "Add 1 to order" });
});

test("the Lists picker names what it holds, and says when there are none or it cannot read them", async () => {
  draft(ITEM_ID);
  server.lists.push(
    { id: "shelf0000001", title: "Display shelf" },
    { id: "favs00000001", title: "Favorites" },
  );
  const user = userEvent.setup();
  openAddPage("/add?to=none");
  await rowsLoaded();
  await user.click(screen.getByRole("button", { name: "Lists" }));
  await user.click(await screen.findByRole("checkbox", { name: "Display shelf" }));
  await screen.findByRole("button", { name: "Display shelf" });
  await user.click(await screen.findByRole("checkbox", { name: "Favorites" }));
  await screen.findByRole("button", { name: "2 Lists" });
  cleanup();

  server.lists.length = 0;
  draft(ITEM_ID);
  openAddPage("/add?to=none");
  await rowsLoaded();
  await user.click(screen.getByRole("button", { name: "Lists" }));
  await screen.findByText("No Lists yet.");
  cleanup();

  server.listsFailure = refused(503, "down");
  draft(ITEM_ID);
  openAddPage("/add?to=none");
  await rowsLoaded();
  await user.click(screen.getByRole("button", { name: "Lists" }));
  await screen.findByText("Couldn't load your Lists. Try again.");
});

test("Fill all writes Price, Score and a row's date to the selected rows only", async () => {
  sessionStorage.setItem(
    DRAFT_KEY,
    JSON.stringify([
      { itemId: ITEM_ID, overrides: {}, selected: true },
      { itemId: OTHER_ID, overrides: {}, selected: false },
    ]),
  );
  const user = userEvent.setup();
  openAddPage("/add?to=collection");
  await rowsLoaded();

  await fill(user, "Price");
  await user.type(await screen.findByRole("textbox", { name: "Price" }), "12.50");
  await click(user, "Fill 1 selected");

  await fill(user, "Score");
  const stars = within(await screen.findByRole("group", { name: "Score for every selected row" }));
  await user.click(stars.getAllByRole("button")[7] as HTMLElement);
  await click(user, "Fill 1 selected");

  await fill(user, "Order Date");
  await pickDay(user, "Order Date");
  await click(user, "Fill 1 selected");

  await click(user, "Add 1 to collection");
  await waitFor(() => expect(server.commits).toHaveLength(1));
  const rows = server.commits[0]?.rows ?? [];
  expect(rows.map(({ itemId }) => itemId)).toEqual([ITEM_ID]);
  expect(rows[0]?.price).toBe(1250);
  expect(Number(rows[0]?.score)).toBeGreaterThan(0);
  expect(rows[0]?.orderDate).toMatch(/^\d{4}-\d{2}-15$/u);
});
