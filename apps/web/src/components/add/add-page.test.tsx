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
} from "../../../test/add-app";

configure({ asyncUtilTimeout: 3000 });
setDefaultTimeout(30_000);

const ITEM_ID = "miku00000001";
const OTHER_ID = "rem000000002";
const [CHROME] = SUPPORTED_BROWSERS;
const STOPPED_NOTICE = "The extension stopped. Reload the page to see your picks.";
const ITEMS_READ_FAILED = "Failed to load the items to add";
const MISSING_ROW = "No longer in the item database";

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

const searchBox = () => screen.getByRole("combobox", { name: "Search the Item Database" });
const radio = (name: string) => screen.findByRole("radio", { name });
const radioChecked = async (name: string) => {
  const found = await radio(name);
  return found.getAttribute("aria-checked");
};
const pageReady = () => screen.findByRole("combobox", { name: "Search the Item Database" });

async function searchAndAdd(user: ReturnType<typeof userEvent.setup>, text: string, title: string) {
  await user.type(searchBox(), text);
  await screen.findByRole("option", { name: new RegExp(title, "u") });
  await user.keyboard("{Enter}");
  await screen.findByRole("checkbox", { name: `Select ${title}` });
}

test("a known Item commits with no extension probe and no extension at all", async () => {
  const extension = loadExtension({ installed: false });
  sessionStorage.setItem(
    "myakiba:add-draft",
    JSON.stringify([{ itemId: OTHER_ID, overrides: {}, selected: false }]),
  );
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
  await user.type(searchBox(), "miku");

  await user.click(await screen.findByRole("option", { name: /Hatsune Miku/u }));

  await screen.findByRole("checkbox", { name: "Select Hatsune Miku" });
  expect(document.activeElement).toBe(searchBox());
});

test("Enter after typing on never adds a result of the earlier words", async () => {
  const user = userEvent.setup();
  openAddPage();
  await pageReady();
  await user.type(searchBox(), "miku");
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
  );
  const user = userEvent.setup();
  openAddPage(`/add?item=${ITEM_ID}`);
  await screen.findByRole("checkbox", { name: "Select Hatsune Miku" });

  await user.type(searchBox(), "figure");
  const owned = await screen.findByRole("option", { name: /Owned figure/u });
  expect(owned.textContent).toContain("In your collection (2)");
  expect(owned.textContent).toContain("On your Wishlist");
  const single = screen.getByRole("option", { name: /Single figure/u });
  expect(single.textContent).toContain("In your collection");
  expect(single.textContent).not.toContain("(1)");

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
  await user.type(searchBox(), "https://myfigurecollection.net/item/98777");
  await waitFor(() =>
    expect(server.searches).toContain("https://myfigurecollection.net/item/98777"),
  );
  const noMatch = await screen.findAllByText("No items match in myakiba.");
  expect(noMatch.length).toBeGreaterThan(0);
});

test.each([
  ["/add?to=collection", "Collection", false],
  ["/add?to=order-new", "Order", false],
  ["/add?to=none", "Not owned", false],
  ["/add?to=wishlist", "Not owned", true],
])("%s presets %s", async (entry, kind, wishlist) => {
  seedItems(item("preset000001", { title: "Preset" }));
  sessionStorage.setItem(
    "myakiba:add-draft",
    JSON.stringify([{ itemId: "preset000001", overrides: {}, selected: true }]),
  );
  openAddPage(entry);
  expect(await radioChecked(kind)).toBe("true");
  expect(screen.getByRole("checkbox", { name: "Wishlist" }).getAttribute("aria-checked")).toBe(
    String(wishlist),
  );
});

test("a link to an order presets that Order and reads its title", async () => {
  server.orders.set("spring000001", "Spring order");
  openAddPage(`/add?item=${ITEM_ID}&to=order:spring000001`);
  await screen.findByRole("button", { name: "Add 1 to order Spring order" });
  expect(await radioChecked("Order")).toBe("true");
});

test("nothing is chosen without `to`, and an earlier commit's choice is not remembered", async () => {
  const user = userEvent.setup();
  openAddPage(`/add?item=${ITEM_ID}`);
  const choose = await screen.findByRole("button", { name: "Choose where these go" });
  expect(choose.hasAttribute("disabled")).toBe(true);
  for (const kind of ["Collection", "Order", "Not owned"]) {
    expect(await radioChecked(kind)).toBe("false");
  }

  await user.click(await radio("Collection"));
  await user.click(screen.getByRole("button", { name: "Add 1 to collection" }));
  await waitFor(() => expect(server.commits).toHaveLength(1));
  cleanup();

  openAddPage(`/add?item=${OTHER_ID}`);
  await screen.findByRole("button", { name: "Choose where these go" });
  expect(await radioChecked("Collection")).toBe("false");
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
  expect(screen.getByText("Pick items on MyFigureCollection")).toBeDefined();
  expect(screen.getByText(/Click Pick for myakiba/u)).toBeDefined();
  expect(
    screen.getByRole("link", { name: /Search MyFigureCollection/u }).getAttribute("href"),
  ).toBe("https://myfigurecollection.net/?_tb=item&keywords=");
});

test("the empty state tells someone without the extension where to get it", async () => {
  loadExtension({ installed: false });
  openAddPage();
  await screen.findByText(/under review|Install the myakiba extension|needs desktop Chrome/u);
});

test.each([
  [
    "under review",
    () => {
      browseWith(CHROME.userAgent);
      listIn();
    },
    "The myakiba browser extension is under review",
    [
      "It is in review at the Chrome Web Store now",
      "Until it is listed, new items can't be picked.",
      "Items already in the Item Database can still be added.",
    ],
  ],
  [
    "listed",
    () => {
      browseWith(CHROME.userAgent);
      listIn(CHROME.store);
    },
    "Install the myakiba extension to pick items",
    [
      "Picking needs the myakiba browser extension",
      "Install it from the Chrome Web Store",
      "Items already in the Item Database can still be added",
    ],
  ],
  [
    "in a browser it does not run in",
    () => {
      browseWith(SAFARI);
      listIn(CHROME.store);
    },
    "Picking needs desktop Chrome or Firefox",
    ["to pick items", "Items already in the Item Database can still be added"],
  ],
])(
  "the notice while the extension is %s speaks of picking",
  async (_name, arrange, title, body) => {
    arrange();
    loadExtension({ installed: false });
    openAddPage();

    const heading = await screen.findByText(title);
    const notice = heading.parentElement?.textContent;

    for (const line of body) expect(notice).toContain(line);
    expect(notice).not.toMatch(/import|discord|sideload|unpacked/iu);
  },
);

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
  expect(document.activeElement).toBe(searchBox());
});

test("a row the Item Database no longer has says so and cannot be committed", async () => {
  server.items.delete(OTHER_ID);
  sessionStorage.setItem(
    "myakiba:add-draft",
    JSON.stringify([{ itemId: OTHER_ID, overrides: {}, selected: true }]),
  );
  const user = userEvent.setup();
  openAddPage("/add?to=collection");

  await screen.findByText("No longer in the item database");
  expect(screen.getByRole("button", { name: "Select items to add" }).hasAttribute("disabled")).toBe(
    true,
  );
  await user.click(screen.getByRole("button", { name: "Remove this row" }));
  await screen.findByText("Pick items on MyFigureCollection");
});

test("a failed read of the rows' Items says so, never that they are gone, and Retry recovers them", async () => {
  server.itemsFailure = refused(503, "down");
  sessionStorage.setItem(
    "myakiba:add-draft",
    JSON.stringify([{ itemId: ITEM_ID, overrides: {}, selected: true }]),
  );
  const user = userEvent.setup();
  openAddPage("/add?to=collection");

  const alert = await screen.findByRole("alert");
  expect(alert.textContent).toContain(ITEMS_READ_FAILED);
  expect(screen.getByText("Could not load this item")).toBeDefined();
  expect(screen.queryByText(MISSING_ROW)).toBeNull();

  await user.click(screen.getByRole("button", { name: "Retry" }));
  await screen.findByRole("alert");
  expect(document.activeElement).toBe(searchBox());
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
  sessionStorage.setItem(
    "myakiba:add-draft",
    JSON.stringify([
      { itemId: ITEM_ID, overrides: {}, selected: true },
      { itemId: OTHER_ID, overrides: {}, selected: true },
    ]),
  );
  const user = userEvent.setup();
  openAddPage("/add");

  await user.click(await screen.findByRole("button", { name: "Remove Hatsune Miku" }));

  await waitFor(() =>
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Remove Rem" })),
  );
});

test("the toast shows the added Items' pictures and its View opens the filtered Collection", async () => {
  const user = userEvent.setup();
  const router = openAddPage(`/add?item=${ITEM_ID}&to=collection`);

  await user.click(await screen.findByRole("button", { name: "Add 1 to collection" }));

  await screen.findByText("Added 1 to your collection");
  const notifications = screen.getByRole("region", { name: /Notifications/u });
  expect(within(notifications).getByText("Hatsune Miku")).toBeDefined();
  await user.click(within(notifications).getByRole("button", { name: "View" }));
  await waitFor(() => {
    expect(router.state.location.pathname).toBe("/collection");
    expect(router.state.location.search).toEqual({
      ids: [`collection-${ITEM_ID}`],
    } as typeof router.state.location.search);
  });
});

test("Done on Not owned alone clears the rows with no request and says where they are", async () => {
  const user = userEvent.setup();
  openAddPage(`/add?item=${ITEM_ID}&to=none`);

  await user.click(await screen.findByRole("button", { name: "Done" }));

  await screen.findByText("This item is in the Item Database");
  expect(server.commits).toEqual([]);
  expect(screen.queryByRole("checkbox", { name: "Select Hatsune Miku" })).toBeNull();
});

test("the narrow bar's fields fold behind a control, and open for a field the commit needs", async () => {
  const user = userEvent.setup();
  openAddPage(`/add?item=${ITEM_ID}&to=collection`);
  const toggle = await screen.findByRole("button", { name: "Collection details" });
  expect(toggle.getAttribute("aria-expanded")).toBe("false");

  await user.click(toggle);
  expect(toggle.getAttribute("aria-expanded")).toBe("true");

  await user.click(await radio("Order"));
  await user.click(screen.getByRole("button", { name: "Existing Order" }));
  expect(screen.getByRole("button", { name: "Order details" }).getAttribute("aria-expanded")).toBe(
    "true",
  );
  expect(screen.getByRole("button", { name: "Choose an Order" }).hasAttribute("disabled")).toBe(
    true,
  );
});

test("the page says the extension stopped, with rows or without, and stops saying so once it answers", async () => {
  const extension = loadExtension({});
  extension.stopTakes(true);
  sessionStorage.setItem(
    "myakiba:add-draft",
    JSON.stringify([{ itemId: ITEM_ID, overrides: {}, selected: true }]),
  );
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
  expect(screen.getByText("Pick items on MyFigureCollection")).toBeDefined();
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
