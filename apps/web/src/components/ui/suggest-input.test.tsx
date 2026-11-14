import { afterEach, expect, mock, test } from "bun:test";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Result } from "better-result";
import { useState } from "react";
import { InlineTextCell } from "@/components/cells/inline-text-cell";
import { SuggestInput } from "./suggest-input";
import type { Suggester } from "./suggest-input";

afterEach(cleanup);

const SHOPS = ["AmiAmi", "Amazon", "Mandarake"];

function ShopForm({ onSubmit }: { readonly onSubmit: (shop: string) => void }) {
  const [shop, setShop] = useState("");
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(shop);
      }}
    >
      <SuggestInput
        aria-label="Shop"
        value={shop}
        onValueChange={setShop}
        suggestions={SHOPS.filter((name) => name.toLowerCase().includes(shop.toLowerCase()))}
      />
      <button type="submit">Save</button>
    </form>
  );
}

test("arrow keys and Enter pick a suggestion without submitting the form", async () => {
  const onSubmit = mock((_shop: string) => {});
  render(<ShopForm onSubmit={onSubmit} />);
  const user = userEvent.setup();

  await user.type(screen.getByRole("combobox", { name: "Shop" }), "ama");
  await screen.findByRole("option", { name: "Amazon" });
  await user.keyboard("{ArrowDown}{Enter}");

  expect(screen.getByRole<HTMLInputElement>("combobox", { name: "Shop" }).value).toBe("Amazon");
  expect(onSubmit).not.toHaveBeenCalled();
});

test("Enter with no suggestion highlighted submits the form", async () => {
  const onSubmit = mock((_shop: string) => {});
  render(<ShopForm onSubmit={onSubmit} />);
  const user = userEvent.setup();

  await user.type(screen.getByRole("combobox", { name: "Shop" }), "ami");
  await screen.findByRole("option", { name: "AmiAmi" });
  await user.keyboard("{Enter}");

  expect(onSubmit).toHaveBeenCalledWith("ami");
});

test("Escape closes the suggestions and keeps the typed shop", async () => {
  render(<ShopForm onSubmit={() => {}} />);
  const user = userEvent.setup();

  await user.type(screen.getByRole("combobox", { name: "Shop" }), "man");
  await screen.findByRole("option", { name: "Mandarake" });
  await user.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("option")).toBeNull());
  await user.keyboard("{Escape}");

  expect(screen.getByRole<HTMLInputElement>("combobox", { name: "Shop" }).value).toBe("man");
});

const suggester: Suggester = {
  suggestions: (query) =>
    SHOPS.filter((name) => name.toLowerCase().startsWith(query.toLowerCase())),
  canonical: (typed) =>
    SHOPS.find((name) => name.toLowerCase() === typed.trim().toLowerCase()) ?? typed.trim(),
};

function renderShopCell() {
  const onSubmit = mock(async (_shop: string) => Result.ok());
  render(
    <InlineTextCell label="Shop" value="Mandarake" onSubmit={onSubmit} suggester={suggester} />,
  );
  return onSubmit;
}

test("a cell saves a picked suggestion at once", async () => {
  const onSubmit = renderShopCell();
  const user = userEvent.setup();

  await user.click(screen.getByRole("button", { name: /edit Shop$/ }));
  await user.keyboard("ami");
  await screen.findByRole("option", { name: "AmiAmi" });
  await user.keyboard("{ArrowDown}{Enter}");

  await waitFor(() => expect(onSubmit).toHaveBeenCalledWith("AmiAmi"));
  expect(onSubmit).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole("combobox", { name: "Shop" })).toBeNull();
});

test("a cell saves the known spelling of a typed shop on Enter", async () => {
  const onSubmit = renderShopCell();
  const user = userEvent.setup();

  await user.click(screen.getByRole("button", { name: /edit Shop$/ }));
  await user.keyboard("amiami{Enter}");

  await waitFor(() => expect(onSubmit).toHaveBeenCalledWith("AmiAmi"));
});

test("Escape in a cell first closes the suggestions, then cancels the edit", async () => {
  const onSubmit = renderShopCell();
  const user = userEvent.setup();

  await user.click(screen.getByRole("button", { name: /edit Shop$/ }));
  await user.keyboard("ama");
  await screen.findByRole("option", { name: "Amazon" });
  await user.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("option")).toBeNull());
  expect(screen.getByRole("combobox", { name: "Shop" })).toBeDefined();

  await user.keyboard("{Escape}");

  expect(screen.queryByRole("combobox", { name: "Shop" })).toBeNull();
  expect(onSubmit).not.toHaveBeenCalled();
});
