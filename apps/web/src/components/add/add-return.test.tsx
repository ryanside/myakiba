import { afterEach, beforeEach, expect, setDefaultTimeout, test } from "bun:test";
import { cleanup, configure, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Result } from "better-result";
import { rootedRead, useRead } from "@/data/client";
import type { Family, RootOf } from "@/data/catalog";
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

const { AddLink } = await import("./add-link");

configure({ asyncUtilTimeout: 3000 });
setDefaultTimeout(30_000);

const ITEM_ID = "miku00000001";
const OTHER_ID = "rem000000002";
const DRAFT_KEY = "myakiba:add-draft";

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
const rowsLoaded = () => screen.findAllByRole("checkbox", { name: /^Select (?!all)/u });
const addTo = (path: string, to: string) => `/add?to=${to}&returnTo=${encodeURIComponent(path)}`;

test("a toolbar Add link goes to the Add page, not a sheet, and records the page and its search", async () => {
  server.pages.set("/collection", () => <AddLink search={{ to: "collection" }} />);
  const router = openAddPage("/collection?page=2#shelf");

  const link = await screen.findByRole("link", { name: "Add" });
  expect(link.getAttribute("href")).toBe(
    `/add?to=collection&returnTo=${encodeURIComponent("/collection?page=2#shelf")}`,
  );
  await userEvent.setup().click(link);

  await waitFor(() => expect(router.state.location.pathname).toBe("/add"));
  expect(screen.queryByRole("dialog")).toBeNull();
});

test("a commit that empties the page goes back to where the link was, with its toast", async () => {
  draft(ITEM_ID);
  const user = userEvent.setup();
  const router = openAddPage(addTo("/collection?page=2", "collection"));
  await rowsLoaded();

  await user.click(screen.getByRole("button", { name: "Add 1 to collection" }));

  await waitFor(() => expect(router.state.location.href).toBe("/collection?page=2"));
  await screen.findByRole("heading", { name: "/collection" });
  const notifications = screen.getByRole("region", { name: /Notifications/u });
  expect(within(notifications).getByText("Added 1 to your collection")).toBeDefined();
  expect(sessionStorage.getItem(DRAFT_KEY)).toBe("[]");
});

test("the way back leaves no Add page behind it", async () => {
  draft(ITEM_ID);
  const user = userEvent.setup();
  const router = openAddPage(addTo("/collection", "collection"));
  await rowsLoaded();
  const before = router.history.length;

  await user.click(screen.getByRole("button", { name: "Add 1 to collection" }));

  await waitFor(() => expect(router.state.location.pathname).toBe("/collection"));
  expect(router.history.length).toBe(before);
});

test("Done goes back too, since saving the pick already added the Item", async () => {
  draft(ITEM_ID);
  const user = userEvent.setup();
  const router = openAddPage(addTo("/items", "none"));
  await rowsLoaded();

  await user.click(screen.getByRole("button", { name: "Done" }));

  await waitFor(() => expect(router.state.location.pathname).toBe("/items"));
  await screen.findByText("This item is in the Item Database");
  expect(server.commits).toEqual([]);
});

test("a link's Item row keeps the way back when it leaves the URL", async () => {
  const user = userEvent.setup();
  const router = openAddPage(`/add?item=${ITEM_ID}&to=collection&returnTo=%2Fitem%2F98777`);
  await rowsLoaded();
  await waitFor(() =>
    expect(router.state.location.search).toEqual({ to: "collection", returnTo: "/item/98777" }),
  );

  await user.click(screen.getByRole("button", { name: "Add 1 to collection" }));

  await waitFor(() => expect(router.state.location.pathname).toBe("/item/98777"));
});

test("an unselected row keeps the user here, and the commit that empties the page goes back", async () => {
  draft(ITEM_ID, OTHER_ID);
  const user = userEvent.setup();
  const router = openAddPage(addTo("/collection", "collection"));
  await rowsLoaded();
  await user.click(screen.getByRole("checkbox", { name: "Select Rem" }));

  await user.click(screen.getByRole("button", { name: "Add 1 to collection" }));

  await waitFor(() =>
    expect(screen.queryByRole("checkbox", { name: "Select Hatsune Miku" })).toBeNull(),
  );
  await screen.findByText("Added 1 to your collection");
  expect(router.state.location.pathname).toBe("/add");
  expect(document.activeElement).toBe(
    screen.getByRole("combobox", { name: "Search the Item Database" }),
  );

  await user.click(screen.getByRole("checkbox", { name: "Select Rem" }));
  await user.click(await screen.findByRole("button", { name: "Add 1 to collection" }));
  await waitFor(() => expect(router.state.location.pathname).toBe("/collection"));
});

test("a pick still saving keeps the user here", async () => {
  let finish = () => {};
  server.uploadAnswer = async () => {
    await new Promise<void>((resolve) => {
      finish = resolve;
    });
    return refused(503, "down");
  };
  let answer = () => {};
  const { commitAnswer } = server;
  server.commitAnswer = async (body) => {
    await new Promise<void>((resolve) => {
      answer = resolve;
    });
    return commitAnswer(body);
  };
  const extension = loadExtension({});
  draft(ITEM_ID);
  const user = userEvent.setup();
  const router = openAddPage(addTo("/collection", "collection"));
  await rowsLoaded();
  await user.click(screen.getByRole("button", { name: "Add 1 to collection" }));
  await waitFor(() => expect(server.commits).toHaveLength(1));
  extension.setPicks([fakePick(12_345, "Still saving")]);
  window.dispatchEvent(new Event("focus"));
  await screen.findByText("Saving…");

  answer();

  await screen.findByText("Added 1 to your collection");
  expect(router.state.location.pathname).toBe("/add");
  expect(screen.getByText("Still saving")).toBeDefined();
  finish();
});

test("a failed pick keeps the user here", async () => {
  server.uploadAnswer = async () => refused(503, "down");
  loadExtension({ picks: [fakePick(12_345, "Failed pick")] });
  draft(ITEM_ID);
  const user = userEvent.setup();
  const router = openAddPage(addTo("/collection", "collection"));
  await screen.findByText("myakiba could not save this item.");
  await rowsLoaded();

  await user.click(screen.getByRole("button", { name: "Add 1 to collection" }));

  await screen.findByText("Added 1 to your collection");
  expect(router.state.location.pathname).toBe("/add");
  expect(screen.getByRole("button", { name: "Retry Failed pick" })).toBeDefined();
});

test("a pick saved while the commit is in flight keeps the user here", async () => {
  seedItems(item("item-12345", { title: "Late pick" }));
  let release = () => {};
  const { commitAnswer } = server;
  server.commitAnswer = async (body) => {
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    return commitAnswer(body);
  };
  draft(ITEM_ID);
  const extension = loadExtension({});
  const user = userEvent.setup();
  const router = openAddPage(addTo("/collection", "collection"));
  await rowsLoaded();
  await user.click(screen.getByRole("button", { name: "Add 1 to collection" }));
  await waitFor(() => expect(server.commits).toHaveLength(1));

  extension.setPicks([fakePick(12_345, "Late pick")]);
  window.dispatchEvent(new Event("focus"));
  await screen.findByRole("checkbox", { name: "Select Late pick" });
  release();

  await screen.findByText("Added 1 to your collection");
  expect(router.state.location.pathname).toBe("/add");
  expect(screen.getByRole("checkbox", { name: "Select Late pick" })).toBeDefined();
});

test("a failed commit stays, and keeps its rows", async () => {
  server.commitAnswer = async () => refused(503, "down");
  draft(ITEM_ID);
  const user = userEvent.setup();
  const router = openAddPage(addTo("/collection", "collection"));
  await rowsLoaded();

  await user.click(screen.getByRole("button", { name: "Add 1 to collection" }));

  await waitFor(() => expect(server.commits).toHaveLength(1));
  await waitFor(() => expect(document.querySelector("[inert]")).toBeNull());
  expect(router.state.location.pathname).toBe("/add");
  expect(screen.getByRole("checkbox", { name: "Select Hatsune Miku" })).toBeDefined();
});

test("a link without a way back, as the sidebar's, stays on the Add page", async () => {
  draft(ITEM_ID);
  const user = userEvent.setup();
  const router = openAddPage("/add?to=collection");
  await rowsLoaded();

  await user.click(screen.getByRole("button", { name: "Add 1 to collection" }));

  await screen.findByText("Added 1 to your collection");
  expect(router.state.location.pathname).toBe("/add");
});

test.each([
  ["an external target", "https://evil.example/"],
  ["a protocol-relative target", "//evil.example/"],
  ["a backslash target", "/\\evil.example/"],
])("%s is dropped, and the commit stays on the Add page", async (_name, target) => {
  draft(ITEM_ID);
  const user = userEvent.setup();
  const router = openAddPage(`/add?to=collection&returnTo=${encodeURIComponent(target)}`);
  await rowsLoaded();

  await user.click(screen.getByRole("button", { name: "Add 1 to collection" }));

  await screen.findByText("Added 1 to your collection");
  expect(router.state.location.pathname).toBe("/add");
  expect(router.state.location.href.startsWith("/add")).toBe(true);
});

/** Stands in for an origin page's own read, in the family that page's real read uses. */
function originRead<F extends Family>(family: F, root: RootOf<F>) {
  const rows: string[] = ["An earlier row"];
  const read = rootedRead(family, {
    key: () => [root, "origin-page"] as const,
    load: async () => Result.ok({ rows: [...rows] }),
    staleTime: Number.POSITIVE_INFINITY,
  });
  function Page() {
    const { data } = useRead(read);
    return (
      <ul>
        {data?.rows.map((row) => (
          <li key={row}>{row}</li>
        ))}
      </ul>
    );
  }
  return { rows, Page };
}

test.each([
  ["/collection", "collection", "collection"],
  ["/orders", "orders", "orders"],
  ["/items", "itemDatabase", "item-database-items"],
  ["/item/$externalId", "item", "item"],
] as const)("%s shows the new row on return, with no reload", async (route, family, root) => {
  const origin = originRead(family, root as RootOf<typeof family>);
  const path = route.replace("$externalId", "98777");
  server.pages.set(route, () => (
    <>
      <AddLink search={{ item: ITEM_ID, to: "collection" }}>Add here</AddLink>
      <origin.Page />
    </>
  ));
  const { commitAnswer } = server;
  server.commitAnswer = async (body) => {
    origin.rows.push("The new row");
    return commitAnswer(body);
  };
  const user = userEvent.setup();
  const router = openAddPage(path);
  await screen.findByText("An earlier row");
  expect(screen.queryByText("The new row")).toBeNull();

  await user.click(screen.getByRole("link", { name: "Add here" }));
  await user.click(await screen.findByRole("button", { name: "Add 1 to collection" }));

  await waitFor(() => expect(router.state.location.pathname).toBe(path));
  await screen.findByText("The new row");
  expect(screen.getByText("An earlier row")).toBeDefined();
});

test("returning puts focus on the page it returned to", async () => {
  server.pages.set("/collection", () => <main tabIndex={-1}>The Collection</main>);
  draft(ITEM_ID);
  const user = userEvent.setup();
  const router = openAddPage(addTo("/collection", "collection"));
  await rowsLoaded();
  await user.click(screen.getByRole("button", { name: "Add 1 to collection" }));
  await waitFor(() => expect(router.state.location.pathname).toBe("/collection"));
  await waitFor(() => expect(document.activeElement?.tagName).toBe("MAIN"));
});
