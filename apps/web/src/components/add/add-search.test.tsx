import { afterEach, beforeEach, expect, setDefaultTimeout, test } from "bun:test";
import { act, cleanup, configure, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRef, useState } from "react";
import { item, refused, renderInApp, resetServer, seedItems, server } from "../../../test/add-app";

configure({ asyncUtilTimeout: 3000 });
setDefaultTimeout(30_000);

const { AddSearch } = await import("./add-search");

beforeEach(() => {
  resetServer();
  seedItems(
    item("miku00000001", { title: "Hatsune Miku" }),
    item("rem000000002", { title: "Rem" }),
  );
});
afterEach(cleanup);

const searchBox = () => screen.findByRole("combobox", { name: "Search myakiba" });
const isDimmed = ({ className }: Element) => className.split(/\s+/u).includes("opacity-60");
const pause = (ms: number) =>
  act(async () => {
    await new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  });

function Search({ onAdd }: { readonly onAdd: (itemId: string) => void }) {
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(true);
  return (
    <AddSearch
      initialQuery=""
      draftItemIds={new Set()}
      open={open}
      triggerRef={trigger}
      onOpenChange={setOpen}
      onAdd={({ itemId }) => onAdd(itemId)}
    />
  );
}

function renderSearch() {
  const added: string[] = [];
  renderInApp(<Search onAdd={(itemId) => added.push(itemId)} />);
  return added;
}

const searchButton = () => screen.getByRole("button", { name: "Search myakiba" });

/** Holds every search answer until the returned function runs. */
function holdSearches() {
  const release: (() => void)[] = [];
  const { search } = server;
  server.search = async (query) => {
    await new Promise<void>((resolve) => {
      release.push(resolve);
    });
    return search(query);
  };
  return () => {
    for (const answer of release) answer();
  };
}

test("a burst of typing waits 250 ms and sends one search", async () => {
  const user = userEvent.setup();
  renderSearch();
  await user.type(await searchBox(), "miku");
  expect(server.searches).toEqual([]);

  await pause(150);
  expect(server.searches).toEqual([]);

  await waitFor(() => expect(server.searches).toEqual(["miku"]));
});

test("the first search says Searching… and its list is busy until the answer", async () => {
  const release = holdSearches();
  const user = userEvent.setup();
  renderSearch();
  await user.type(await searchBox(), "miku");

  expect(screen.getByText("Searching…")).toBeDefined();
  expect(screen.getByRole("listbox").getAttribute("aria-busy")).toBe("true");
  await waitFor(() => expect(server.searches).toEqual(["miku"]));
  expect(screen.getByText("Searching…")).toBeDefined();
  expect(screen.getByRole("listbox").getAttribute("aria-busy")).toBe("true");

  await act(async () => release());
  await screen.findByRole("option", { name: /Hatsune Miku/u });
  expect(screen.getByRole("listbox").getAttribute("aria-busy")).toBe("false");
  expect(screen.queryByText("Searching…")).toBeNull();
});

test("the earlier results stay dimmed and busy, and Enter on them adds nothing, until the new answer", async () => {
  const user = userEvent.setup();
  const added = renderSearch();
  const box = await searchBox();
  await user.type(box, "hat");
  const result = await screen.findByRole("option", { name: /Hatsune Miku/u });
  await waitFor(() => expect(screen.getByRole("listbox").getAttribute("aria-busy")).toBe("false"));
  expect(isDimmed(result)).toBe(false);

  const release = holdSearches();
  await user.type(box, "sune");

  const earlier = () => screen.getByRole("option", { name: /Hatsune Miku/u });
  expect(isDimmed(earlier())).toBe(true);
  expect(screen.getByRole("listbox").getAttribute("aria-busy")).toBe("true");
  await user.keyboard("{Enter}");
  expect(added).toEqual([]);

  await waitFor(() => expect(server.searches).toEqual(["hat", "hatsune"]));
  expect(screen.getByRole("listbox").getAttribute("aria-busy")).toBe("true");
  expect(isDimmed(earlier())).toBe(true);

  await act(async () => release());
  await waitFor(() => expect(screen.getByRole("listbox").getAttribute("aria-busy")).toBe("false"));
  expect(isDimmed(earlier())).toBe(false);
});

test("a failed search says so, in the panel and in the status region", async () => {
  server.search = async () => refused(503, "down");
  const user = userEvent.setup();
  renderSearch();
  await user.type(await searchBox(), "miku");

  await screen.findByText("Couldn't search myakiba. Try again.");
  expect(screen.getByRole("listbox").getAttribute("aria-busy")).toBe("false");
  const regions = screen.getAllByRole("status");
  expect(regions.some(({ textContent }) => textContent === "Couldn't search myakiba.")).toBe(true);
});

test("a result shows its picture, title, release date and release price", async () => {
  seedItems(item("pictured0001", { title: "Pictured", image: "/images/pictured.jpg" }));
  const user = userEvent.setup();
  renderSearch();
  await user.type(await searchBox(), "pictured");

  const result = await screen.findByRole("option", { name: /Pictured/u });
  expect(result.querySelector("img")?.getAttribute("src")).toBe("/images/pictured.jpg");
  expect(result.textContent).toContain("01/15/2027");
  expect(result.textContent).toContain("$5,000.00");
});

test("Escape closes the panel and puts focus on its button, and the words wait for its return", async () => {
  const user = userEvent.setup();
  renderSearch();
  const box = await searchBox();
  await user.type(box, "rem");
  await screen.findByRole("option", { name: /^Rem/u });

  await user.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull());
  await waitFor(() => expect(document.activeElement).toBe(searchButton()));

  await user.click(searchButton());
  const reopened = (await searchBox()) as HTMLInputElement;
  expect(reopened.value).toBe("rem");
  await waitFor(() => expect(document.activeElement).toBe(reopened));
});

test("a click outside closes the panel and puts focus on its button", async () => {
  const user = userEvent.setup();
  renderSearch();
  await searchBox();

  await user.click(document.body);
  await waitFor(() => expect(screen.queryByRole("combobox")).toBeNull());
  await waitFor(() => expect(document.activeElement).toBe(searchButton()));
});

test("a click outside on another control leaves focus there", async () => {
  const user = userEvent.setup();
  renderInApp(
    <>
      <Search onAdd={() => {}} />
      <input aria-label="Another field" />
    </>,
  );
  await searchBox();

  const other = screen.getByRole("textbox", { name: "Another field" });
  await user.click(other);
  await waitFor(() => expect(screen.queryByRole("combobox", { name: /Search/u })).toBeNull());
  await waitFor(() => expect(document.activeElement).toBe(other));
});

test("adding a result keeps the panel open with focus in the search", async () => {
  const user = userEvent.setup();
  const added = renderSearch();
  const box = (await searchBox()) as HTMLInputElement;
  await user.type(box, "rem");
  await screen.findByRole("option", { name: /^Rem/u });
  await waitFor(() => expect(screen.getByRole("listbox").getAttribute("aria-busy")).toBe("false"));

  await user.click(screen.getByRole("option", { name: /^Rem/u }));

  expect(added).toEqual(["rem000000002"]);
  expect(box.value).toBe("");
  expect(box.isConnected).toBe(true);
  expect(document.activeElement).toBe(box);
});

test("the next search after an add keeps every letter typed", async () => {
  const user = userEvent.setup();
  renderSearch();
  const box = (await searchBox()) as HTMLInputElement;
  await user.type(box, "rem");
  await screen.findByRole("option", { name: /^Rem/u });
  await waitFor(() => expect(screen.getByRole("listbox").getAttribute("aria-busy")).toBe("false"));
  await user.keyboard("{Enter}");
  await waitFor(() => expect(box.value).toBe(""));

  await user.keyboard("mi");
  expect(box.value).toBe("mi");
});

test("Escape from the panel's footer closes it and puts focus on its button", async () => {
  renderSearch();
  const user = userEvent.setup();
  const box = await searchBox();
  await user.click(box);
  await user.keyboard("figure");
  const footer = await screen.findByRole("link", { name: /Not here\? Search MFC/u });
  footer.focus();
  await user.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("link", { name: /Not here/u })).toBeNull());
  await waitFor(() => expect(document.activeElement).toBe(searchButton()));
});
