import { afterEach, beforeEach, expect, setDefaultTimeout, test } from "bun:test";
import { cleanup, configure, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  item,
  loadExtension,
  openAddPage,
  resetServer,
  seedItems,
  server,
} from "../../../test/add-app";

configure({ asyncUtilTimeout: 3000 });
setDefaultTimeout(30_000);

const ITEM_ID = "miku00000001";

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  resetServer();
  loadExtension({});
  seedItems(item(ITEM_ID, { title: "Hatsune Miku", externalId: 98_777 }));
  sessionStorage.setItem(
    "myakiba:add-draft",
    JSON.stringify([{ itemId: ITEM_ID, overrides: {}, selected: true }]),
  );
  server.lists.push(
    { id: "shelf0000001", title: "Display shelf" },
    { id: "gifts0000001", title: "Gifts" },
  );
});
afterEach(cleanup);

const rowsLoaded = () => screen.findAllByRole("checkbox", { name: /^Select (?!all)/u });
const sentence = () => screen.getByRole("region", { name: "Destination" });
// Base UI gives a tooltip no role, as its words are already the control's name.
const tooltip = () => document.querySelector('[data-slot="tooltip-content"]');

/** A narrow sentence hides or cuts words with CSS, which a test's DOM never lays out, so it fakes a cut. */
function cutEveryWord() {
  Object.defineProperty(HTMLElement.prototype, "scrollWidth", {
    configurable: true,
    get: () => 100,
  });
}
afterEach(() => {
  Reflect.deleteProperty(HTMLElement.prototype, "scrollWidth");
});

test("the sentence holds every word a width may hide, and each control its whole name", async () => {
  openAddPage("/add?to=collection");
  await rowsLoaded();

  const text = sentence().textContent ?? "";
  for (const words of ["Add 1 item to", "also on", "Wishlist", "and", "Lists"]) {
    expect(text).toContain(words);
  }
  // Each control's name leaves out its icons and count.
  expect(within(sentence()).getByRole("checkbox", { name: "Wishlist" })).toBeDefined();
  const user = userEvent.setup();
  await user.click(within(sentence()).getByRole("button", { name: "Lists" }));
  await user.click(await screen.findByRole("checkbox", { name: "Display shelf" }));
  await user.keyboard("{Escape}");
  expect(within(sentence()).getByRole("button", { name: "Display shelf" })).toBeDefined();
});

test("the sentence has one Lists control at every width, so a resize keeps its popup with it", async () => {
  openAddPage("/add?to=collection");
  await rowsLoaded();

  const popupTriggers = within(sentence())
    .getAllByRole("button")
    .filter((button) => button.getAttribute("aria-haspopup") === "dialog");
  expect(popupTriggers).toHaveLength(1);
});

test("folded, the Lists control names what it holds, and its popup holds the sentence's Wishlist", async () => {
  // A container query shows the folded face, which the browser check proves. Here every observed
  // box reports a size, as that face does when it shows.
  const realResizeObserver = globalThis.ResizeObserver;
  globalThis.ResizeObserver = class extends realResizeObserver {
    constructor(onResize: ResizeObserverCallback) {
      super(onResize);
      const shown = { contentRect: { width: 36 } } as ResizeObserverEntry;
      this.observe = () => onResize([shown], this);
    }
  };
  try {
    const user = userEvent.setup();
    openAddPage("/add?to=collection");
    await rowsLoaded();

    const folded = within(sentence()).getByRole("button", { name: "Wishlist and Lists" });
    await user.click(within(sentence()).getByRole("checkbox", { name: "Wishlist" }));
    expect(within(sentence()).getByRole("button", { name: "Also on Wishlist" })).toBe(folded);

    await user.click(folded);
    const popover = await screen.findByRole("dialog", { name: "Wishlist and Lists" });
    const wishlist = within(popover).getByRole("checkbox", { name: "Wishlist" });
    expect(wishlist.getAttribute("aria-checked")).toBe("true");
    await user.click(wishlist);
    await user.click(within(popover).getByRole("checkbox", { name: "Display shelf" }));
    expect(folded.textContent).toContain("Also on ‘Display shelf’");
    await user.click(within(popover).getByRole("checkbox", { name: "Wishlist" }));
    expect(folded.textContent).toContain("Also on Wishlist and ‘Display shelf’");
    await user.click(within(popover).getByRole("checkbox", { name: "Gifts" }));
    expect(within(sentence()).getByRole("button", { name: "Also on Wishlist and 2 Lists" })).toBe(
      folded,
    );
    await user.keyboard("{Escape}");
    await waitFor(() => expect(document.activeElement).toBe(folded));

    // It is the same choice as the separate controls, so the commit carries it.
    expect(
      within(sentence()).getByRole("checkbox", { name: "Wishlist" }).getAttribute("aria-checked"),
    ).toBe("true");
    await user.click(screen.getByRole("button", { name: "Add 1 to collection" }));
    await waitFor(() => expect(server.commits).toHaveLength(1));
    expect(server.commits[0]?.wishlist).toBe(true);
    expect(server.commits[0]?.listIds).toEqual(["shelf0000001", "gifts0000001"]);
  } finally {
    globalThis.ResizeObserver = realResizeObserver;
  }
});

test("a control whose words are cut shows its whole name in a tooltip, by pointer and by keyboard", async () => {
  cutEveryWord();
  const user = userEvent.setup();
  openAddPage("/add?to=collection");
  await rowsLoaded();

  await user.hover(within(sentence()).getByText("Wishlist"));
  await waitFor(() => expect(tooltip()?.textContent).toBe("Wishlist"));
  await user.unhover(within(sentence()).getByText("Wishlist"));
  await waitFor(() => expect(tooltip()).toBeNull());

  await user.click(within(sentence()).getByRole("button", { name: "Lists" }));
  await user.click(await screen.findByRole("checkbox", { name: "Gifts" }));
  await user.keyboard("{Escape}");
  const lists = within(sentence()).getByRole("button", { name: "Gifts" });
  await waitFor(() => expect(document.activeElement).toBe(lists));
  await user.tab();
  await user.tab({ shift: true });
  await waitFor(() => expect(tooltip()?.textContent).toBe("Lists: Gifts"));
  await user.tab({ shift: true });
  expect(document.activeElement).toBe(
    within(sentence()).getByRole("checkbox", { name: "Wishlist" }),
  );
  await waitFor(() => expect(tooltip()?.textContent).toBe("Wishlist"));
});

test("a control whose words show whole has no tooltip", async () => {
  const user = userEvent.setup();
  openAddPage("/add?to=collection");
  await rowsLoaded();

  await user.hover(within(sentence()).getByText("Wishlist"));
  await user.hover(within(sentence()).getByRole("button", { name: "Lists" }));
  expect(tooltip()).toBeNull();
});

test("the destination menu opens without motion from the keyboard, and with it from a pointer", async () => {
  const user = userEvent.setup();
  openAddPage("/add?to=collection");
  await rowsLoaded();
  const destination = within(sentence()).getByRole("combobox", { name: "Where these go" });
  const menu = () => document.querySelector<HTMLElement>('[data-slot="select-content"]');

  // A key pressed this soon before the click would make the click count as the key's doing.
  await new Promise((resolve) => {
    setTimeout(resolve, 600);
  });
  await user.click(destination);
  await screen.findByRole("listbox");
  expect(menu()?.dataset.instant).toBeUndefined();
  await user.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull());

  destination.focus();
  await user.keyboard("{ArrowDown}");
  await screen.findByRole("listbox");
  expect(menu()?.dataset.instant).toBe("");
});
