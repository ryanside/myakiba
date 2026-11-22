import { afterEach, beforeEach, expect, setDefaultTimeout, test } from "bun:test";
import { cleanup, configure, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  item,
  loadExtension,
  openAddPage,
  resetServer,
  seedDraft,
  seedItems,
  server,
} from "../../../test/add-app";

configure({ asyncUtilTimeout: 3000 });
setDefaultTimeout(30_000);

const ITEM_ID = "miku00000001";
const OTHER_ID = "rem000000002";

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

const commitIds = () => server.commits.map(({ commitId }) => commitId);

async function loseTheAnswer(entry: string, button: string) {
  const { commitAnswer } = server;
  server.commitAnswer = () => new Promise(() => {});
  const user = userEvent.setup();
  openAddPage(entry);
  await user.click(await screen.findByRole("button", { name: button }));
  await waitFor(() => expect(server.commits).toHaveLength(1));
  cleanup();
  server.commitAnswer = commitAnswer;
}

test("a reload mid-commit, then the same click, sends the same commitId", async () => {
  await loseTheAnswer(`/add?item=${ITEM_ID}&to=collection`, "Add 1 to collection");

  const user = userEvent.setup();
  openAddPage("/add?to=collection");
  await user.click(await screen.findByRole("button", { name: "Add 1 to collection" }));

  await screen.findByText("Added 1 to your collection");
  const [lost, retried] = commitIds();
  expect(retried).toBe(lost);
});

test("after a reload, other choices start a new commitId", async () => {
  await loseTheAnswer(`/add?item=${ITEM_ID}&to=collection`, "Add 1 to collection");

  const user = userEvent.setup();
  openAddPage(`/add?item=${OTHER_ID}&to=collection`);
  await user.click(await screen.findByRole("button", { name: "Add 2 to collection" }));

  await screen.findByText("Added 2 to your collection");
  const [lost, next] = commitIds();
  expect(next).not.toBe(lost);
});

test("the same choices after a commit that answered start a new commitId", async () => {
  const user = userEvent.setup();
  for (const _visit of [1, 2]) {
    openAddPage(`/add?item=${ITEM_ID}&to=collection`);
    await user.click(await screen.findByRole("button", { name: "Add 1 to collection" }));
    await screen.findByText("Added 1 to your collection");
    cleanup();
  }

  const [first, second] = commitIds();
  expect(second).not.toBe(first);
});

test("a reload after a lost answer keeps each row's selection, so the retry repeats the commit", async () => {
  seedDraft([
    { itemId: ITEM_ID, overrides: {} },
    { itemId: OTHER_ID, overrides: {} },
  ]);
  const { commitAnswer } = server;
  server.commitAnswer = () => new Promise(() => {});
  const user = userEvent.setup();
  openAddPage("/add?to=collection");
  const rem = await screen.findByRole("checkbox", { name: "Select Rem" });
  await user.click(rem);
  await user.click(rem);
  await user.click(screen.getByRole("button", { name: "Add 2 to collection" }));
  await waitFor(() => expect(server.commits).toHaveLength(1));
  cleanup();
  // The server saved both rows before its answer was lost.
  seedItems(
    item(ITEM_ID, { title: "Hatsune Miku", externalId: 98_777, collectionCount: 1 }),
    item(OTHER_ID, { title: "Rem", externalId: 112_233, collectionCount: 1 }),
  );
  server.commitAnswer = commitAnswer;

  openAddPage("/add?to=collection");
  const checked = (title: string) =>
    screen.queryByRole("checkbox", { name: `Select ${title}` })?.getAttribute("aria-checked");
  await waitFor(() => expect([checked("Hatsune Miku"), checked("Rem")]).toEqual(["true", "true"]));
  await user.click(screen.getByRole("button", { name: "Add 2 to collection" }));
  await waitFor(() => expect(server.commits).toHaveLength(2));
  const [lost, retried] = server.commits;
  expect([retried?.commitId, retried?.rows.map(({ itemId }) => itemId)]).toEqual([
    lost?.commitId,
    lost?.rows.map(({ itemId }) => itemId),
  ]);
});
