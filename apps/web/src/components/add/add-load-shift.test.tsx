import { afterEach, beforeEach, expect, setDefaultTimeout, test } from "bun:test";
import { act, cleanup, configure, screen, waitFor } from "@testing-library/react";
import {
  item,
  loadExtension,
  openAddPage,
  resetServer,
  seedItems,
  server,
} from "../../../test/add-app";
import { fakePick } from "../../../test/fake-extension";

configure({ asyncUtilTimeout: 3000 });
setDefaultTimeout(30_000);

const DRAFT_KEY = "myakiba:add-draft";
const MIKU = "miku00000001";
const REM = "rem000000002";

const draft = (rows: readonly (readonly [string, boolean])[]) =>
  sessionStorage.setItem(
    DRAFT_KEY,
    JSON.stringify(rows.map(([itemId, selected]) => ({ itemId, overrides: {}, selected }))),
  );

let release = () => {};

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  resetServer();
  loadExtension({});
  seedItems(item(MIKU, { title: "Miku" }), item(REM, { title: "Rem" }));
  server.itemsGate = new Promise<void>((resolve) => {
    release = resolve;
  });
});
afterEach(async () => {
  await act(async () => release());
  cleanup();
});

const sentence = () => screen.getByRole("region", { name: "Destination" }).textContent;

test("the sentence says how many before the Items load, and the same after", async () => {
  draft([
    [MIKU, true],
    [REM, true],
  ]);
  openAddPage("/add?to=collection");
  await screen.findByRole("heading", { name: "Add items" });
  expect(sentence()).toContain("Add 2 items to");

  await act(async () => release());
  await screen.findByRole("checkbox", { name: "Select Miku" });
  expect(sentence()).toContain("Add 2 items to");
});

test("the sentence counts an unselected row as unselected before the Items load", async () => {
  draft([
    [MIKU, true],
    [REM, false],
  ]);
  openAddPage("/add?to=collection");
  await screen.findByRole("heading", { name: "Add items" });
  expect(sentence()).toContain("Add 1 of 2 items to");
});

test("the commit's label and summary say how many before the Items load", async () => {
  draft([
    [MIKU, true],
    [REM, true],
  ]);
  openAddPage("/add?to=collection");
  const commit = await screen.findByRole("button", { name: "Add 2 to collection" });
  expect(commit.hasAttribute("disabled")).toBe(true);
  expect(screen.getByText("2 items to your Collection")).toBeDefined();

  await act(async () => release());
  await screen.findByRole("checkbox", { name: "Select Miku" });
  expect(screen.getByRole("button", { name: "Add 2 to collection" }).hasAttribute("disabled")).toBe(
    false,
  );
  expect(screen.getByText("2 items to your Collection")).toBeDefined();
});

test("a row whose Item turned out to be gone leaves the count once the read answers", async () => {
  draft([
    [MIKU, true],
    ["gone00000001", true],
  ]);
  openAddPage("/add?to=collection");
  await screen.findByRole("heading", { name: "Add items" });
  expect(sentence()).toContain("Add 2 items to");

  await act(async () => release());
  await screen.findByRole("checkbox", { name: "Select Miku" });
  expect(sentence()).toContain("Add 1 item to");
  expect(screen.getByRole("button", { name: "Add 1 to collection" })).toBeDefined();
});

test("the header drops a row whose Item is gone, as the sentence does", async () => {
  draft([
    [MIKU, true],
    ["gone00000001", true],
  ]);
  openAddPage("/add?to=collection");
  await screen.findByRole("heading", { name: "Add items" });
  expect(screen.getByText("2 Items")).toBeDefined();

  await act(async () => release());
  await screen.findByRole("checkbox", { name: "Select Miku" });
  expect(screen.getByText("1 Item")).toBeDefined();
  expect(sentence()).toContain("Add 1 item to");
});

test("an empty page's words hold their room until the extension answers, with no card popping in", async () => {
  loadExtension({ installed: false });
  openAddPage();
  const title = await screen.findByText("No items yet");
  const row = title.closest("td");
  expect(row).not.toBeNull();
  const hidden = title.nextElementSibling;
  expect(hidden?.getAttribute("class")).toContain("opacity-0");
  expect(hidden?.hasAttribute("inert")).toBe(true);

  await waitFor(() => expect(hidden?.getAttribute("class")).not.toContain("opacity-0"), {
    timeout: 2000,
  });
  expect(title.nextElementSibling).toBe(hidden);
  expect(row?.querySelector("[class*='bg-muted']")).toBeNull();
});

test("an empty page holds one message, with no room left for another", async () => {
  openAddPage();
  const title = await screen.findByText("No items yet");
  expect(title.nextElementSibling?.querySelectorAll("p").length).toBe(1);
});

test("a saving pick counts in the sentence, the header and the commit from when it is known", async () => {
  const held: (() => void)[] = [];
  server.uploadAnswer = async () => {
    await new Promise<void>((resolve) => {
      held.push(resolve);
    });
    return { data: { saved: "created", itemId: MIKU, mfcItemId: 12_345 }, error: null };
  };
  loadExtension({ picks: [fakePick(12_345, "Miku"), fakePick(12_346, "Rem")] });
  openAddPage("/add?from=mfc");
  await screen.findAllByText("Saving…");

  expect(sentence()).toContain("Add 2 items to");
  expect(screen.getByText("2 Items")).toBeDefined();
  const commit = screen.getByRole("button", { name: "Choose where these go" });
  expect(commit.hasAttribute("disabled")).toBe(true);
  expect(screen.getByRole("combobox", { name: "Where these go" }).hasAttribute("disabled")).toBe(
    false,
  );
  await act(async () => {
    for (const finish of held) finish();
  });
});

test("the commit waits for a saving pick its label already counts", async () => {
  let finish = () => {};
  server.uploadAnswer = async () => {
    await new Promise<void>((resolve) => {
      finish = resolve;
    });
    return { data: { saved: "created", itemId: REM, mfcItemId: 12_345 }, error: null };
  };
  draft([[MIKU, true]]);
  await act(async () => release());
  loadExtension({ picks: [fakePick(12_345, "Rem")] });
  openAddPage("/add?to=collection");
  await screen.findByText("Saving…");
  await screen.findByRole("checkbox", { name: "Select Miku" });
  const commit = screen.getByRole("button", { name: "Add 2 to collection" });
  expect(commit.hasAttribute("disabled")).toBe(true);

  await act(async () => finish());
  await screen.findByRole("checkbox", { name: "Select Rem" });
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Add 2 to collection" }).hasAttribute("disabled"),
    ).toBe(false),
  );
});

test("the page a Pick sends the user to shows a skeleton row until the extension answers", async () => {
  loadExtension({ answersPicks: false });
  openAddPage("/add?from=mfc");
  await screen.findByRole("heading", { name: "Review your picks" });
  expect(screen.queryByText("No items yet")).toBeNull();
  expect(document.querySelector('tr[data-row="awaiting-picks"]')).not.toBeNull();
  expect(screen.queryByRole("region", { name: "Commit" })).toBeNull();

  await screen.findByText("No items yet");
  expect(document.querySelector('tr[data-row="awaiting-picks"]')).toBeNull();
});

test("the Order title's pencil waits for the title, so it doesn't jump when the Items load", async () => {
  draft([[MIKU, true]]);
  openAddPage("/add?to=order-new");
  const title = await screen.findByRole("button", { name: "Edit Order title" });
  expect(title.querySelector("svg")).toBeNull();

  await act(async () => release());

  await waitFor(() => expect(title.textContent).toContain("Miku"));
  expect(title.querySelector("svg")).not.toBeNull();
});
