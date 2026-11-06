import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ComponentType, ReactElement } from "react";
import CollectionFiltersForm from "./collection/filters-form";
import OrdersFiltersForm from "./orders/orders-filters-form";
import { ExpensesFilters } from "./expenses/filters";

afterEach(cleanup);

type FiltersFormProps = {
  renderTrigger: ReactElement;
  onApplyFilters: () => void;
  currency: "USD";
};

const FORMS: readonly (readonly [string, ComponentType<FiltersFormProps>])[] = [
  ["collection", CollectionFiltersForm],
  ["orders", OrdersFiltersForm],
];

function presses(element: Element): boolean {
  const classes = element.classList;
  return (
    (classes.contains("press") || classes.contains("press-text")) && !classes.contains("press-none")
  );
}

// A field trigger opens a menu, a listbox or a picker in place of typing.
function pressingFieldTriggers(container: HTMLElement): string[] {
  return [...container.querySelectorAll("[aria-haspopup], [role=combobox]")]
    .filter(presses)
    .map((element) => element.textContent?.trim() ?? "");
}

describe("field triggers keep still when pressed", () => {
  for (const [name, FiltersForm] of FORMS) {
    test(`${name} filters`, async () => {
      render(
        <QueryClientProvider client={new QueryClient()}>
          <FiltersForm
            renderTrigger={<button type="button">Filters</button>}
            onApplyFilters={() => {}}
            currency="USD"
          />
        </QueryClientProvider>,
      );
      await userEvent.setup({ delay: null }).click(screen.getByRole("button", { name: "Filters" }));
      const dialog = await screen.findByRole("dialog");

      expect(pressingFieldTriggers(dialog)).toEqual([]);
    });
  }

  test("expenses filters", () => {
    const { container } = render(
      <ExpensesFilters
        filters={{}}
        isLoading={false}
        shopOptions={["AmiAmi"]}
        onChange={() => {}}
        onClear={() => {}}
      />,
    );

    expect(pressingFieldTriggers(container)).toEqual([]);
  });
});
