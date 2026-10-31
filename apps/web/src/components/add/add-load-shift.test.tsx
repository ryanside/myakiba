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
  expect(screen.getByText("2 new Collection Items")).toBeDefined();

  await act(async () => release());
  await screen.findByRole("checkbox", { name: "Select Miku" });
  expect(screen.getByRole("button", { name: "Add 2 to collection" }).hasAttribute("disabled")).toBe(
    false,
  );
  expect(screen.getByText("2 new Collection Items")).toBeDefined();
});

test("the Total holds its place while the Items load", async () => {
  draft([[MIKU, true]]);
  openAddPage("/add?to=collection");
  const total = await screen.findByText(/^Total/u);
  expect(total.textContent).toBe("Total ");

  await act(async () => release());
  await screen.findByRole("checkbox", { name: "Select Miku" });
  expect(total.isConnected).toBe(true);
  expect(total.textContent).toBe("Total $5,000.00");
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

test("an empty page's words hold their room until the extension answers, with no card popping in", async () => {
  loadExtension({ installed: false });
  openAddPage();
  const title = await screen.findByText("No items yet");
  const row = title.closest("td");
  expect(row).not.toBeNull();
  const hidden = title.nextElementSibling;
  expect(hidden?.getAttribute("class")).toContain("opacity-0");
  expect(hidden?.hasAttribute("inert")).toBe(true);
  const held = hidden?.querySelectorAll("p");
  expect(held?.length).toBe(2);

  await waitFor(() => expect(hidden?.getAttribute("class")).not.toContain("opacity-0"), {
    timeout: 2000,
  });
  expect(title.nextElementSibling).toBe(hidden);
  expect(hidden?.querySelectorAll("p").length).toBe(2);
  expect(row?.querySelector("[class*='bg-muted']")).toBeNull();
});
