import { afterEach, beforeEach, expect, setDefaultTimeout, test } from "bun:test";
import { act, cleanup, configure, screen, waitFor } from "@testing-library/react";
import {
  draftItemIds,
  item,
  loadExtension,
  openAddPage,
  resetServer,
  seedItems,
  signInElsewhere,
} from "../../../test/add-app";

configure({ asyncUtilTimeout: 3000 });
setDefaultTimeout(30_000);

const ITEM_ID = "miku00000001";
const OTHER_ACCOUNT = { id: "other-collector", email: "other@example.com", username: "other" };

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  resetServer();
  loadExtension({});
  seedItems(item(ITEM_ID, { title: "Hatsune Miku", externalId: 98_777 }));
});
afterEach(cleanup);

const openAs = async (user: Partial<typeof OTHER_ACCOUNT> = {}, entry = "/add") => {
  openAddPage(entry, user);
  await screen.findByRole("button", { name: "Search myakiba" });
};
// A boolean, so a failure prints no DOM tree.
const showsRow = () => screen.queryByRole("checkbox", { name: "Select Hatsune Miku" }) !== null;

test("a reload keeps the account's rows", async () => {
  await openAs({}, `/add?item=${ITEM_ID}`);
  await screen.findByRole("checkbox", { name: "Select Hatsune Miku" });
  cleanup();

  await openAs();

  expect(showsRow()).toBe(true);
});

test("another account in the same tab opens an empty Add page, and the rows it left are gone", async () => {
  await openAs({}, `/add?item=${ITEM_ID}`);
  await screen.findByRole("checkbox", { name: "Select Hatsune Miku" });
  cleanup();

  await openAs(OTHER_ACCOUNT);
  expect(showsRow()).toBe(false);
  cleanup();

  await openAs();
  expect(showsRow()).toBe(false);
});

test("another account signing in from another tab while Add is open shows and keeps none of the rows", async () => {
  const router = openAddPage(`/add?item=${ITEM_ID}`);
  await screen.findByRole("checkbox", { name: "Select Hatsune Miku" });
  await waitFor(() => expect(draftItemIds()).toEqual([ITEM_ID]));

  await act(() => signInElsewhere(router, OTHER_ACCOUNT));

  await screen.findByRole("button", { name: "Search myakiba" });
  expect(showsRow()).toBe(false);
  expect(draftItemIds() ?? []).toEqual([]);
});
