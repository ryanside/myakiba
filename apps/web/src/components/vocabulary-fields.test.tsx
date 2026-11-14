import { afterEach, expect, mock, test } from "bun:test";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import type { ReactElement } from "react";
import type { ShopTerm, TagTerm, VocabularyResponse } from "@myakiba/contracts/vocabulary/schema";
import { ShopInput, TagsInput, VocabularyFilterField } from "./vocabulary-fields";

afterEach(cleanup);

const term = (value: string, ownedUses: number, orderUses: number): ShopTerm => ({
  value,
  uses: ownedUses + orderUses,
  ownedUses,
  orderUses,
  lastUsedAt: "2026-01-01T00:00:00.000Z",
});

const tag = (value: string, uses: number, ownedUses: number): TagTerm => ({
  value,
  uses,
  ownedUses,
  lastUsedAt: "2026-01-01T00:00:00.000Z",
});

function renderWithVocabulary(ui: ReactElement, vocabulary: Partial<VocabularyResponse>) {
  const client = new QueryClient();
  client.setQueryData(["vocabulary"], { shops: [], tags: [], scales: [], ...vocabulary });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

function ShopForm({ onSave }: { readonly onSave: (shop: string) => void }) {
  const [shop, setShop] = useState("");
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSave(shop);
      }}
    >
      <ShopInput aria-label="Shop" value={shop} onValueChange={setShop} />
      <button type="submit">Save</button>
    </form>
  );
}

const SHOPS = [term("AmiAmi", 3, 2), term("amiami", 1, 0), term("Mandarake", 0, 1)];
const TAGS = [
  tag("Favorite", 3, 2),
  tag("favorite", 1, 1),
  tag("fav orite", 1, 1),
  tag("preorder only", 1, 0),
];

test("typing part of a saved shop suggests it", async () => {
  renderWithVocabulary(<ShopForm onSave={() => {}} />, { shops: SHOPS });
  const user = userEvent.setup();

  await user.type(screen.getByRole("combobox", { name: "Shop" }), "ami");

  const options = await screen.findAllByRole("option");
  expect(options.map((option) => option.textContent)).toEqual(["AmiAmi"]);
});

test("a shop saves as typed, even when a saved shop is spelled another way", async () => {
  const onSave = mock((_shop: string) => {});
  renderWithVocabulary(<ShopForm onSave={onSave} />, { shops: SHOPS });
  const user = userEvent.setup();

  const save = screen.getByRole("button", { name: "Save" });
  await user.type(screen.getByRole("combobox", { name: "Shop" }), "ami ami");
  await user.click(save);
  expect(onSave).toHaveBeenLastCalledWith("ami ami");

  await user.clear(screen.getByRole("combobox", { name: "Shop" }));
  await user.type(screen.getByRole("combobox", { name: "Shop" }), "AMIAMI{Escape}{Enter}");
  expect(onSave).toHaveBeenLastCalledWith("AMIAMI");
});

function TagsForm() {
  const [tags, setTags] = useState<readonly string[]>([]);
  return (
    <>
      <TagsInput aria-label="Tags" values={tags} onValuesChange={setTags} />
      <output aria-label="Saved tags">{JSON.stringify(tags)}</output>
    </>
  );
}

test("the tag field suggests each of the user's tags once, in its most-used spelling", async () => {
  renderWithVocabulary(<TagsForm />, { tags: TAGS });
  const user = userEvent.setup();

  await user.type(screen.getByRole("combobox", { name: "Tags" }), "FAV");

  const options = await screen.findAllByRole("option");
  expect(options.map((option) => option.textContent)).toEqual(["Favorite"]);
  await user.click(options[0] as HTMLElement);
  expect(screen.getByLabelText("Saved tags").textContent).toBe('["Favorite"]');
});

test("a tag saves exactly as typed, even when a saved tag is spelled another way", async () => {
  renderWithVocabulary(<TagsForm />, { tags: TAGS });
  const user = userEvent.setup();

  await user.type(
    screen.getByRole("combobox", { name: "Tags" }),
    "favourite{Enter}fav orite{Enter}",
  );

  expect(screen.getByLabelText("Saved tags").textContent).toBe('["favourite","fav orite"]');
});

function FilterField({
  filter,
  initial,
}: {
  readonly filter: "collectionShops" | "orderShops" | "collectionTags" | "collectionScales";
  readonly initial: string[];
}) {
  const [values, setValues] = useState<string[]>(initial);
  return (
    <>
      <VocabularyFilterField filter={filter} value={values} onValueChange={setValues} />
      <output aria-label="Chosen">{JSON.stringify(values)}</output>
    </>
  );
}

test("the shop filter lists the shops its records use, with their counts, and keeps a chosen shop no longer saved", async () => {
  renderWithVocabulary(<FilterField filter="orderShops" initial={["Gone Shop"]} />, {
    shops: SHOPS,
  });
  const user = userEvent.setup();

  await user.click(screen.getByRole("button", { name: "Select shops" }));
  const options = await screen.findAllByRole("menuitemcheckbox");
  expect(options.map((option) => option.textContent)).toEqual(["AmiAmi2", "Mandarake1"]);

  await user.click(within(options[1] as HTMLElement).getByText("Mandarake"));
  await user.keyboard("{Escape}");
  expect(screen.getByText("Mandarake")).toBeDefined();

  await user.click(screen.getByRole("button", { name: "Remove Gone Shop" }));
  expect(screen.queryByText("Gone Shop")).toBeNull();
});

test("the tag filter lists each spelling on Owned Collection Items with its Owned count, and keeps a chosen tag no longer saved", async () => {
  renderWithVocabulary(<FilterField filter="collectionTags" initial={["gone"]} />, {
    tags: TAGS,
  });
  const user = userEvent.setup();

  await user.click(screen.getByRole("button", { name: "Select tags" }));
  const options = await screen.findAllByRole("menuitemcheckbox");
  expect(options.map((option) => option.textContent)).toEqual([
    "Favorite2",
    "favorite1",
    "fav orite1",
  ]);

  await user.click(within(options[1] as HTMLElement).getByText("favorite"));
  await user.keyboard("{Escape}");
  expect(screen.getByLabelText("Chosen").textContent).toBe('["gone","favorite"]');

  await user.click(screen.getByRole("button", { name: "Remove gone" }));
  expect(screen.getByLabelText("Chosen").textContent).toBe('["favorite"]');
});

test("a filter lists its terms by the count it shows, most first", async () => {
  renderWithVocabulary(<FilterField filter="collectionTags" initial={[]} />, {
    tags: [tag("limited", 5, 1), tag("Favorite", 3, 2)],
  });
  const user = userEvent.setup();

  await user.click(screen.getByRole("button", { name: "Select tags" }));
  const options = await screen.findAllByRole("menuitemcheckbox");

  expect(options.map((option) => option.textContent)).toEqual(["Favorite2", "limited1"]);
});

test("the scale filter lists Owned counts, names the no-scale value, and picks the stored value", async () => {
  renderWithVocabulary(<FilterField filter="collectionScales" initial={["1/4"]} />, {
    scales: [
      { value: "1/7", ownedUses: 3 },
      { value: "n/a", ownedUses: 1 },
    ],
  });
  const user = userEvent.setup();

  await user.click(screen.getByRole("button", { name: "Select scales" }));
  const options = await screen.findAllByRole("menuitemcheckbox");
  expect(options.map((option) => option.textContent)).toEqual(["1/73", "n/a (non-scale)1"]);

  await user.click(within(options[1] as HTMLElement).getByText("n/a (non-scale)"));
  await user.keyboard("{Escape}");

  expect(screen.getByLabelText("Chosen").textContent).toBe('["1/4","n/a"]');
  expect(screen.getByRole("button", { name: "Remove n/a (non-scale)" })).toBeDefined();
  expect(screen.getByRole("button", { name: "Remove 1/4" })).toBeDefined();
});
