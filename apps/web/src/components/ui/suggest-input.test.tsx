import { afterEach, expect, mock, test } from "bun:test";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Result } from "better-result";
import { useState } from "react";
import { InlineTextCell } from "@/components/cells/inline-text-cell";
import { SuggestInput } from "./suggest-input";

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

const suggest = (query: string) =>
  SHOPS.filter((name) => name.toLowerCase().startsWith(query.toLowerCase()));

function renderShopCell() {
  const onSubmit = mock(async (_shop: string) => Result.ok());
  render(<InlineTextCell label="Shop" value="Mandarake" onSubmit={onSubmit} suggest={suggest} />);
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

test("a cell saves a typed shop as typed on Enter", async () => {
  const onSubmit = renderShopCell();
  const user = userEvent.setup();

  await user.click(screen.getByRole("button", { name: /edit Shop$/ }));
  await user.keyboard("amiami{Enter}");

  await waitFor(() => expect(onSubmit).toHaveBeenCalledWith("amiami"));
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

test("Enter that confirms IME composition keeps the cell open and saves nothing", async () => {
  const onSubmit = renderShopCell();
  const user = userEvent.setup();

  await user.click(screen.getByRole("button", { name: /edit Shop$/ }));
  const field = screen.getByRole("combobox", { name: "Shop" });
  fireEvent.keyDown(field, { key: "Enter", isComposing: true });
  fireEvent.keyDown(field, { key: "Enter", keyCode: 229 });

  expect(screen.getByRole("combobox", { name: "Shop" })).toBeDefined();
  expect(onSubmit).not.toHaveBeenCalled();
});

test("Enter that confirms IME composition never picks a highlighted suggestion", async () => {
  const onSubmit = renderShopCell();
  const user = userEvent.setup();

  await user.click(screen.getByRole("button", { name: /edit Shop$/ }));
  await user.keyboard("ami");
  await screen.findByRole("option", { name: "AmiAmi" });
  await user.keyboard("{ArrowDown}");
  const field = screen.getByRole<HTMLInputElement>("combobox", { name: "Shop" });
  fireEvent.keyDown(field, { key: "Enter", isComposing: true });

  expect(screen.getByRole<HTMLInputElement>("combobox", { name: "Shop" }).value).toBe("ami");
  expect(onSubmit).not.toHaveBeenCalled();
});

test("the list stays closed when its only suggestion is what was typed", async () => {
  render(<ShopForm onSubmit={() => {}} />);
  const user = userEvent.setup();

  await user.type(screen.getByRole("combobox", { name: "Shop" }), "Amazon");

  expect(screen.queryByRole("option")).toBeNull();
  expect(screen.getByRole("combobox", { name: "Shop" }).getAttribute("aria-expanded")).not.toBe(
    "true",
  );
});
