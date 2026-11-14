import { afterEach, expect, mock, test } from "bun:test";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import type { ReactElement } from "react";
import type { ShopTerm } from "@myakiba/contracts/vocabulary/schema";
import { ShopFilterField, ShopInput } from "./shop-fields";

afterEach(cleanup);

const term = (value: string, ownedUses: number, orderUses: number): ShopTerm => ({
  value,
  ownedUses,
  orderUses,
  lastUsedAt: "2026-01-01T00:00:00.000Z",
});

function renderWithShops(ui: ReactElement, shops: readonly ShopTerm[]) {
  const client = new QueryClient();
  client.setQueryData(["vocabulary"], { shops: [...shops] });
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

test("typing part of a saved shop suggests it", async () => {
  renderWithShops(<ShopForm onSave={() => {}} />, SHOPS);
  const user = userEvent.setup();

  await user.type(screen.getByRole("combobox", { name: "Shop" }), "ami");

  const options = await screen.findAllByRole("option");
  expect(options.map((option) => option.textContent)).toEqual(["AmiAmi"]);
});

test("a saved shop typed another way saves its usual spelling", async () => {
  const onSave = mock((_shop: string) => {});
  renderWithShops(<ShopForm onSave={onSave} />, SHOPS);
  const user = userEvent.setup();

  const save = screen.getByRole("button", { name: "Save" });
  await user.type(screen.getByRole("combobox", { name: "Shop" }), "amiami");
  await user.click(save);
  expect(onSave).toHaveBeenLastCalledWith("AmiAmi");

  await user.clear(screen.getByRole("combobox", { name: "Shop" }));
  await user.type(screen.getByRole("combobox", { name: "Shop" }), " AMIAMI{Escape}{Enter}");
  expect(onSave).toHaveBeenLastCalledWith("AmiAmi");
});

function FilterField({ uses }: { readonly uses: "ownedUses" | "orderUses" }) {
  const [shops, setShops] = useState<string[]>(["Gone Shop"]);
  return <ShopFilterField value={shops} onValueChange={setShops} uses={uses} />;
}

test("the filter lists the shops its records use, with their counts, and keeps a chosen shop no longer saved", async () => {
  renderWithShops(<FilterField uses="orderUses" />, SHOPS);
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
