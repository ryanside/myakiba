import { afterEach, beforeEach, expect, setDefaultTimeout, test } from "bun:test";
import { act, cleanup, configure, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SAFARI, SUPPORTED_BROWSERS, browseWith, listIn } from "../../../test/extension-browser";
import { fakePick } from "../../../test/fake-extension";
import {
  item,
  loadExtension,
  openAddPage,
  refused,
  resetServer,
  seedItems,
  server,
  seedDraft,
} from "../../../test/add-app";

configure({ asyncUtilTimeout: 3000 });
setDefaultTimeout(30_000);

const ITEM_ID = "miku00000001";
const OTHER_ID = "rem000000002";
const [CHROME] = SUPPORTED_BROWSERS;
const STOPPED_NOTICE = "The extension stopped. Reload the page to see your picks.";
const ITEMS_READ_FAILED = "Failed to load the items to add";
const MISSING_ROW = "No longer in myakiba";

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

const searchBox = () => screen.getByRole("combobox", { name: "Search myakiba" });
const destination = () => screen.findByRole("combobox", { name: "Where these go" });
const chosenDestination = async () => {
  const trigger = await destination();
  return trigger.textContent;
};
const choose = async (user: ReturnType<typeof userEvent.setup>, name: string) => {
  await user.click(await destination());
  await user.click(await screen.findByRole("option", { name }));
};
const searchButton = () => screen.getByRole("button", { name: "Search myakiba" });
const pageReady = () => screen.findByRole("button", { name: "Search myakiba" });
const openSearch = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(searchButton());
  return screen.findByRole("combobox", { name: "Search myakiba" });
};

async function searchAndAdd(user: ReturnType<typeof userEvent.setup>, text: string, title: string) {
  const box =
    screen.queryByRole("combobox", { name: "Search myakiba" }) ?? (await openSearch(user));
  await user.type(box, text);
  await screen.findByRole("option", { name: new RegExp(title, "u") });
  await user.keyboard("{Enter}");
  await screen.findByRole("checkbox", { name: `Select ${title}` });
}

test("a known Item commits with no extension probe and no extension at all", async () => {
  const extension = loadExtension({ installed: false });
  seedDraft([{ itemId: OTHER_ID, overrides: {}, selected: false }]);
  const user = userEvent.setup();
  openAddPage(`/add?item=${ITEM_ID}&to=collection`);

  await user.click(await screen.findByRole("button", { name: "Add 1 to collection" }));

  await waitFor(() => expect(server.commits).toHaveLength(1));
  await screen.findByText("Added 1 to your collection");
  expect(server.commits[0]?.rows).toEqual([{ itemId: ITEM_ID, price: null }]);
  expect(extension.posted.some((post) => post.message.request.type === "hello")).toBe(false);
  expect(screen.queryByRole("dialog", { name: /myakiba extension/u })).toBeNull();
});

test("search adds the row on Enter and keeps focus for the next one", async () => {
  const user = userEvent.setup();
  openAddPage();
  await pageReady();
  await searchAndAdd(user, "miku", "Hatsune Miku");

  expect(document.activeElement).toBe(searchBox());
  expect((searchBox() as HTMLInputElement).value).toBe("");

  await searchAndAdd(user, "rem", "Rem");
  expect(document.activeElement).toBe(searchBox());
});

test("search adds the row on click and keeps focus", async () => {
  const user = userEvent.setup();
  openAddPage();
  await pageReady();
  await user.type(await openSearch(user), "miku");

  await user.click(await screen.findByRole("option", { name: /Hatsune Miku/u }));

  await screen.findByRole("checkbox", { name: "Select Hatsune Miku" });
  expect(document.activeElement).toBe(searchBox());
});

test("Enter after typing on never adds a result of the earlier words", async () => {
  const user = userEvent.setup();
  openAddPage();
  await pageReady();
  await user.type(await openSearch(user), "miku");
  await screen.findByRole("option", { name: /Hatsune Miku/u });

  await user.clear(searchBox());
  await user.type(searchBox(), "rem");
  await user.keyboard("{Enter}");
  expect(screen.queryByRole("checkbox", { name: "Select Hatsune Miku" })).toBeNull();

  await screen.findByRole("option", { name: /^Rem/u });
  await waitFor(() => expect(screen.getByRole("listbox").getAttribute("aria-busy")).toBe("false"));
  await user.keyboard("{Enter}");
  await screen.findByRole("checkbox", { name: "Select Rem" });
  expect(screen.queryByRole("checkbox", { name: "Select Hatsune Miku" })).toBeNull();
});

test("search shows badges, marks a row already added and links to MFC's search", async () => {
  seedItems(
    item("owned0000001", { title: "Owned figure", collectionCount: 2, wishlisted: true }),
    item("single000001", { title: "Single figure", collectionCount: 1 }),
    item("ordered00001", { title: "Ordered figure", onOrderCount: 1 }),
    item("both00000001", { title: "Both figure", collectionCount: 1, onOrderCount: 2 }),
  );
  const user = userEvent.setup();
  openAddPage(`/add?item=${ITEM_ID}`);
  await screen.findByRole("checkbox", { name: "Select Hatsune Miku" });

  await user.type(await openSearch(user), "figure");
  const owned = await screen.findByRole("option", { name: /Owned figure/u });
  expect(owned.textContent).toContain("In your collection (2)");
  expect(owned.textContent).toContain("On your Wishlist");
  const single = screen.getByRole("option", { name: /Single figure/u });
  expect(single.textContent).toContain("In your collection");
  expect(single.textContent).not.toContain("(1)");
  expect(single.textContent).not.toContain("On order");
  const ordered = screen.getByRole("option", { name: /Ordered figure/u });
  expect(ordered.textContent).toContain("On order");
  expect(ordered.textContent).not.toContain("(1)");
  expect(ordered.textContent).not.toContain("In your collection");
  const both = screen.getByRole("option", { name: /Both figure/u });
  expect(both.textContent).toContain("In your collection");
  expect(both.textContent).toContain("On order (2)");

  const link = screen.getByRole("link", { name: "Not here? Search MFC for ‘figure’" });
  expect(link.getAttribute("href")).toBe(
    "https://myfigurecollection.net/?_tb=item&keywords=figure",
  );
  expect(link.getAttribute("target")).toBe("_blank");
  expect(link.getAttribute("rel")).toBe("noopener noreferrer");

  await user.clear(searchBox());
  await user.type(searchBox(), "miku");
  const added = await screen.findByRole("option", { name: /Hatsune Miku/u });
  expect(added.textContent).toContain("Added");
  expect(added.getAttribute("aria-disabled")).toBe("true");
});

test("text that looks like an MFC link is searched as text", async () => {
  const user = userEvent.setup();
  openAddPage();
  await pageReady();
  await user.type(await openSearch(user), "https://myfigurecollection.net/item/98777");
  await waitFor(() =>
    expect(server.searches).toContain("https://myfigurecollection.net/item/98777"),
  );
  const noMatch = await screen.findAllByText("No items match in myakiba.");
  expect(noMatch.length).toBeGreaterThan(0);
});

test.each([
  ["/add?to=collection", "Collection", false],
  ["/add?to=order-new", "New Order", false],
  ["/add?to=none", "Item Database", false],
  ["/add?to=wishlist", "Item Database", true],
])("%s presets %s", async (entry, kind, wishlist) => {
  seedItems(item("preset000001", { title: "Preset" }));
  seedDraft([{ itemId: "preset000001", overrides: {}, selected: true }]);
  openAddPage(entry);
  expect(await chosenDestination()).toBe(kind);
  expect(screen.getByRole("checkbox", { name: "Wishlist" }).getAttribute("aria-checked")).toBe(
    String(wishlist),
  );
});

test("Collection asks for a Collection Date, never a status, and sends none", async () => {
  const user = userEvent.setup();
  openAddPage(`/add?item=${ITEM_ID}&to=collection`);

  await screen.findByRole("button", { name: "Add 1 to collection" });
  await user.click(screen.getByRole("button", { name: "Details for Hatsune Miku" }));
  expect(screen.getByRole("button", { name: "Collection Date for Hatsune Miku" })).toBeDefined();
  expect(screen.queryByRole("combobox", { name: "Status" })).toBeNull();

  await user.click(screen.getByRole("button", { name: "Add 1 to collection" }));
  await waitFor(() => expect(server.commits).toHaveLength(1));
  expect<unknown>(server.commits[0]?.ownership).toEqual({
    kind: "collection",
    shared: {
      shop: "",
      collectionDate: null,
      shippingMethod: "n/a",
      condition: "New",
      count: 1,
    },
  });
});

test("a link to an order presets that Order and reads its title", async () => {
  server.orders.set("spring000001", "Spring order");
  openAddPage(`/add?item=${ITEM_ID}&to=order:spring000001`);
  await screen.findByRole("button", { name: "Add 1 to order" });
  expect(await chosenDestination()).toBe("Existing Order");
  await waitFor(() =>
    expect(screen.getByRole("combobox", { name: "Order" }).textContent).toContain("Spring order"),
  );
});

test("nothing is chosen without `to`, and an earlier commit's choice is not remembered", async () => {
  const user = userEvent.setup();
  openAddPage(`/add?item=${ITEM_ID}`);
  const blocked = await screen.findByRole("button", { name: "Choose where these go" });
  expect(blocked.hasAttribute("disabled")).toBe(true);
  expect(await chosenDestination()).toBe("choose where");

  await choose(user, "Collection");
  await user.click(screen.getByRole("button", { name: "Add 1 to collection" }));
  await waitFor(() => expect(server.commits).toHaveLength(1));
  cleanup();

  openAddPage(`/add?item=${OTHER_ID}`);
  await screen.findByRole("button", { name: "Choose where these go" });
  expect(await chosenDestination()).toBe("choose where");
  expect(localStorage.length).toBe(0);
});

test("`item` starts a row and leaves the URL, so a reload after its commit does not add it again", async () => {
  const router = openAddPage(`/add?item=${ITEM_ID}&to=collection`);
  await screen.findByRole("checkbox", { name: "Select Hatsune Miku" });
  await waitFor(() => expect(router.state.location.search).toEqual({ to: "collection" }));
});

test("`mfc` shows a hint linking to the item on MFC", async () => {
  openAddPage("/add?mfc=98777");
  const hint = await screen.findByRole("link", { name: /MFC item #98777 is not in myakiba yet/u });
  expect(hint.getAttribute("href")).toBe("https://myfigurecollection.net/item/98777");
  expect(hint.getAttribute("target")).toBe("_blank");
});

test("the empty state says how picking works and links to MFC's search", async () => {
  openAddPage();
  await screen.findByRole("heading", { name: "Add items" });
  expect(screen.getByText("No items yet")).toBeDefined();
  expect(await screen.findByText(/Click Pick for myakiba/u)).toBeDefined();
  expect(
    screen.getByRole("link", { name: /Search MyFigureCollection/u }).getAttribute("href"),
  ).toBe("https://myfigurecollection.net/?_tb=item&keywords=");
});

test("an empty page keeps its shape, with only search and the one action working", async () => {
  openAddPage();
  await screen.findByRole("heading", { name: "Add items" });
  await screen.findByText("No items yet");

  expect(screen.getByRole("region", { name: "Destination" })).toBeDefined();
  expect(screen.getByRole("combobox", { name: "Where these go" }).hasAttribute("disabled")).toBe(
    true,
  );
  expect(screen.getByRole("checkbox", { name: "Wishlist" }).getAttribute("aria-disabled")).toBe(
    "true",
  );
  for (const name of ["Lists", "Fill all"]) {
    expect(screen.getByRole("button", { name }).hasAttribute("disabled")).toBe(true);
  }
  // The commit stays at the end of the sentence, with nothing yet to do.
  const commit = screen.getByRole("button", { name: "Select items to add" });
  expect(commit.hasAttribute("disabled")).toBe(true);
  expect(screen.getByRole("region", { name: "Destination" }).contains(commit)).toBe(true);
  expect(searchButton().hasAttribute("disabled")).toBe(false);
  expect(
    screen
      .getByRole("link", { name: "Search MyFigureCollection (opens in a new tab)" })
      .getAttribute("href"),
  ).toBe("https://myfigurecollection.net/?_tb=item&keywords=");
  expect(
    screen.getByRole("checkbox", { name: "Select all items" }).getAttribute("aria-disabled"),
  ).toBe("true");
  for (const name of ["Item", "Price", "Count", "Condition"]) {
    expect(screen.getByRole("button", { name }).hasAttribute("disabled")).toBe(true);
  }
  expect(screen.getByRole("columnheader", { name: "Item" })).toBeDefined();
  // Fill all heads the row actions' column, and the searches sit under the message, outside the table.
  const fillAll = screen.getByRole("button", { name: "Fill all" });
  expect(fillAll.closest("th")?.dataset.col).toBe("actions");
  expect(searchButton().closest("table")).toBeNull();
  expect(searchButton().closest('[data-slot="data-grid"]')).not.toBeNull();
});

test.each([
  [
    "in review",
    () => {
      browseWith(CHROME.userAgent);
      listIn();
    },
    /in review at the Chrome Web Store/u,
  ],
  [
    "listed",
    () => {
      browseWith(CHROME.userAgent);
      listIn(CHROME.store);
    },
    /Items already in myakiba can be added without it/u,
  ],
  [
    "in a browser it does not run in",
    () => {
      browseWith(SAFARI);
      listIn(CHROME.store);
    },
    /on desktop Chrome or Firefox/u,
  ],
])("the one message while the extension is %s speaks of picking", async (_name, arrange, body) => {
  arrange();
  loadExtension({ installed: false });
  openAddPage();

  const message = await screen.findByText(body);
  const cell = message.closest("td");
  await waitFor(() =>
    expect(message.parentElement?.parentElement?.className).not.toContain("opacity-0"),
  );
  expect(cell?.textContent).not.toMatch(/import|discord|sideload|unpacked/iu);
  expect(screen.queryByText(/under review/u)).toBeNull();
});

test("while the extension is in review, the message has no action of its own and the row's search opens", async () => {
  browseWith(CHROME.userAgent);
  listIn();
  loadExtension({ installed: false });
  const user = userEvent.setup();
  openAddPage();
  const message = await screen.findByText(/in review at the Chrome Web Store/u);
  expect(message.closest("td")?.querySelector("a, button")).toBeNull();
  await user.click(searchButton());
  await waitFor(() => expect(document.activeElement).toBe(searchBox()));
});

test("from=mfc reads as reviewing picks", async () => {
  openAddPage("/add?from=mfc");
  await screen.findByRole("heading", { name: "Review your picks" });
});

test("saved picks appear as rows, and the extension hears only after the save", async () => {
  seedItems(item("item-98777", { title: "Picked Miku", externalId: 98_777 }));
  let finishUpload: (() => void) | undefined;
  server.uploadAnswer = (mfcItemId) =>
    new Promise((resolve) => {
      finishUpload = () =>
        resolve({
          data: { saved: "created", itemId: `item-${mfcItemId}`, mfcItemId },
          error: null,
        });
    });
  const extension = loadExtension({ picks: [fakePick(98_777, "Picked Miku")] });
  openAddPage();

  await screen.findByText("Saving…");
  expect(screen.getByText("Picked Miku")).toBeDefined();
  expect(extension.acknowledged).toEqual([]);

  act(() => finishUpload?.());

  await screen.findByRole("checkbox", { name: "Select Picked Miku" });
  expect(screen.queryByText("Saving…")).toBeNull();
  await waitFor(() =>
    expect(extension.acknowledged).toEqual([{ type: "picks-saved", mfcItemIds: [98_777] }]),
  );
});

test("a pick that fails stays on the page and retry saves it", async () => {
  seedItems(item("item-98777", { title: "Picked Miku", externalId: 98_777 }));
  server.uploadAnswer = async () => refused(503, "down");
  const user = userEvent.setup();
  const extension = loadExtension({ picks: [fakePick(98_777, "Picked Miku")] });
  openAddPage();

  await screen.findByText("myakiba could not save this item.");
  expect(extension.acknowledged).toEqual([]);

  server.uploadAnswer = async (mfcItemId) => ({
    data: { saved: "created", itemId: `item-${mfcItemId}`, mfcItemId },
    error: null,
  });
  await user.click(screen.getByRole("button", { name: "Retry Picked Miku" }));

  await screen.findByRole("checkbox", { name: "Select Picked Miku" });
  await waitFor(() =>
    expect(extension.acknowledged).toEqual([{ type: "picks-saved", mfcItemIds: [98_777] }]),
  );
});

test("an unverified email uploads nothing, keeps picks and says what to do", async () => {
  const extension = loadExtension({ picks: [fakePick(98_777, "Picked Miku")] });
  openAddPage(`/add?item=${ITEM_ID}&to=collection`, { emailVerified: false });

  await screen.findByText(/Verify your email to add these\. Check the email/u);
  await screen.findByText("Picked Miku");
  expect(screen.getByRole("button", { name: "Resend verification email" })).toBeDefined();
  expect(server.uploads).toEqual([]);
  expect(extension.acknowledged).toEqual([]);
  expect(
    screen.getByRole("button", { name: "Verify your email to add items" }).hasAttribute("disabled"),
  ).toBe(true);
});

test("a reload keeps the rows, and a commit clears only the rows it added", async () => {
  const user = userEvent.setup();
  openAddPage(`/add?item=${ITEM_ID}`);
  await screen.findByRole("checkbox", { name: "Select Hatsune Miku" });
  await searchAndAdd(user, "rem", "Rem");
  cleanup();

  openAddPage("/add?to=collection");
  await screen.findByRole("checkbox", { name: "Select Hatsune Miku" });
  await user.click(screen.getByRole("checkbox", { name: "Select Rem" }));
  await user.click(screen.getByRole("button", { name: "Add 1 to collection" }));

  await waitFor(() =>
    expect(screen.queryByRole("checkbox", { name: "Select Hatsune Miku" })).toBeNull(),
  );
  expect(server.commits[0]?.rows.map(({ itemId }) => itemId)).toEqual([ITEM_ID]);
  expect(screen.getByRole("checkbox", { name: "Select Rem" })).toBeDefined();
  expect(document.activeElement).toBe(searchButton());
});

test("a row myakiba no longer has says so and cannot be committed", async () => {
  server.items.delete(OTHER_ID);
  seedDraft([{ itemId: OTHER_ID, overrides: {}, selected: true }]);
  const user = userEvent.setup();
  openAddPage("/add?to=collection");

  await screen.findByText("No longer in myakiba");
  expect(screen.getByRole("button", { name: "Select items to add" }).hasAttribute("disabled")).toBe(
    true,
  );
  await user.click(screen.getByRole("button", { name: "Remove this row" }));
  await screen.findByText("No items yet");
});

test("a failed read of the rows' Items says so, never that they are gone, and Retry recovers them", async () => {
  server.itemsFailure = refused(503, "down");
  seedDraft([{ itemId: ITEM_ID, overrides: {}, selected: true }]);
  const user = userEvent.setup();
  openAddPage("/add?to=collection");

  const alert = await screen.findByRole("alert");
  expect(alert.textContent).toContain(ITEMS_READ_FAILED);
  expect(screen.getByText("Could not load this item")).toBeDefined();
  expect(screen.queryByText(MISSING_ROW)).toBeNull();

  await user.click(screen.getByRole("button", { name: "Retry" }));
  await screen.findByRole("alert");
  expect(document.activeElement).toBe(searchButton());
  expect(screen.queryByText(MISSING_ROW)).toBeNull();

  server.itemsFailure = null;
  await user.click(screen.getByRole("button", { name: "Retry" }));

  const row = await screen.findByRole("checkbox", { name: "Select Hatsune Miku" });
  expect(row.getAttribute("aria-checked")).toBe("true");
  expect(screen.queryByRole("alert")).toBeNull();
  await user.click(screen.getByRole("button", { name: "Add 1 to collection" }));
  await waitFor(() => expect(server.commits).toHaveLength(1));
});

test("removing a row moves focus to the next row's remove button", async () => {
  seedDraft([
    { itemId: ITEM_ID, overrides: {}, selected: true },
    { itemId: OTHER_ID, overrides: {}, selected: true },
  ]);
  const user = userEvent.setup();
  openAddPage("/add");

  await user.click(await screen.findByRole("button", { name: "Remove Hatsune Miku" }));

  await waitFor(() =>
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Remove Rem" })),
  );
});

test("the toast shows the added Items' pictures and its View opens the filtered Collection", async () => {
  seedItems(item(ITEM_ID, { title: "Hatsune Miku", image: "/images/miku.jpg" }));
  const user = userEvent.setup();
  const router = openAddPage(`/add?item=${ITEM_ID}&to=collection`);

  await user.click(await screen.findByRole("button", { name: "Add 1 to collection" }));

  await screen.findByText("Added 1 to your collection");
  const notifications = screen.getByRole("region", { name: /Notifications/u });
  expect(notifications.querySelector("img")?.getAttribute("src")).toBe("/images/miku.jpg");
  await user.click(within(notifications).getByRole("button", { name: "View" }));
  await waitFor(() => {
    expect(router.state.location.pathname).toBe("/collection");
    expect(router.state.location.search).toEqual({
      ids: [`collection-${ITEM_ID}`],
    } as typeof router.state.location.search);
  });
});

test("Keep on Item Database alone clears the rows with no request and says where they are", async () => {
  const user = userEvent.setup();
  openAddPage(`/add?item=${ITEM_ID}&to=none`);

  await user.click(await screen.findByRole("button", { name: "Keep 1 in Item Database" }));

  await screen.findByText("This item is in the Item Database");
  expect(server.commits).toEqual([]);
  expect(screen.queryByRole("checkbox", { name: "Select Hatsune Miku" })).toBeNull();
});

test("a new Order's title shows it can be edited, with the title as the one control", async () => {
  const user = userEvent.setup();
  openAddPage(`/add?item=${ITEM_ID}&to=order-new`);
  const title = await screen.findByRole("button", { name: /edit Order title$/ });
  const pencil = title.querySelector("svg");
  expect(pencil?.getAttribute("aria-hidden")).toBe("true");

  await user.click(pencil as SVGSVGElement);

  expect(screen.getByRole("textbox", { name: "Order title" })).toBeDefined();
});

test("every Order field is on screen, with nothing to open first", async () => {
  const user = userEvent.setup();
  openAddPage(`/add?item=${ITEM_ID}&to=collection`);
  await choose(user, "New Order");

  expect(screen.queryByRole("button", { name: /Order details/u })).toBeNull();
  for (const name of ["Status", "Shipping Method"]) {
    expect(screen.getByRole("combobox", { name })).toBeDefined();
  }
  for (const name of [
    "Order Date",
    "Release Date",
    "Payment Date",
    "Shipping Date",
    "Collection Date",
  ]) {
    expect(screen.getByRole("button", { name })).toBeDefined();
  }
  for (const name of [
    "Shop",
    "Shipping Fee",
    "Taxes",
    "Duties",
    "Tariffs",
    "Miscellaneous Fees",
    "Notes",
  ]) {
    expect(screen.getByRole("textbox", { name })).toBeDefined();
  }

  await choose(user, "Existing Order");
  expect(screen.getByRole("combobox", { name: "Order" })).toBeDefined();
  expect(screen.getByRole("button", { name: "Choose an Order" }).hasAttribute("disabled")).toBe(
    true,
  );
});

test("the page says the extension stopped, with rows or without, and stops saying so once it answers", async () => {
  const extension = loadExtension({});
  extension.stopTakes(true);
  seedDraft([{ itemId: ITEM_ID, overrides: {}, selected: true }]);
  openAddPage();

  const alert = await screen.findByRole("alert");
  expect(alert.textContent).toBe(STOPPED_NOTICE);
  await screen.findByRole("checkbox", { name: "Select Hatsune Miku" });

  extension.stopTakes(false);
  act(() => {
    window.dispatchEvent(new Event("focus"));
  });
  await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  cleanup();
  sessionStorage.clear();

  extension.stopTakes(true);
  openAddPage();
  const empty = await screen.findByRole("alert");
  expect(empty.textContent).toBe(STOPPED_NOTICE);
  expect(screen.getByText("No items yet")).toBeDefined();
});

test("an extension that was never there is not called stopped", async () => {
  const extension = loadExtension({ installed: false });
  openAddPage();
  await waitFor(() =>
    expect(extension.posted.some(({ message }) => message.request.type === "take-picks")).toBe(
      true,
    ),
  );
  await new Promise((resolve) => {
    setTimeout(resolve, 100);
  });
  expect(screen.queryByText(STOPPED_NOTICE)).toBeNull();
});

test("a failed pick is announced, and the announcement region is there before it", async () => {
  server.uploadAnswer = async () => refused(503, "down");
  loadExtension({ picks: [fakePick(98_777, "Picked Miku")] });
  openAddPage();
  await screen.findByText("myakiba could not save this item.");
  const regions = screen.getAllByRole("status");
  expect(regions.some((region) => region.textContent === "1 pick could not be saved")).toBe(true);
});

test("the commit button stays at the end of the sentence, disabled whenever it has nothing to commit", async () => {
  const user = userEvent.setup();
  seedDraft([{ itemId: ITEM_ID, overrides: {}, selected: true }]);
  openAddPage("/add?to=collection");
  const commit = await screen.findByRole("button", { name: "Add 1 to collection" });
  await screen.findByRole("checkbox", { name: /^Select (?!all)/u });
  await waitFor(() => expect(commit.hasAttribute("disabled")).toBe(false));

  await user.click(screen.getByRole("checkbox", { name: /^Select (?!all)/u }));
  expect(commit.getAttribute("aria-label")).toBeNull();
  expect(screen.getByRole("button", { name: "Select items to add" })).toBe(commit);
  expect(commit.hasAttribute("disabled")).toBe(true);

  await user.click(screen.getByRole("button", { name: /^Remove /u }));
  await screen.findByText("No items yet");
  expect(screen.getByRole("button", { name: "Select items to add" })).toBe(commit);
  expect(commit.hasAttribute("disabled")).toBe(true);
});
