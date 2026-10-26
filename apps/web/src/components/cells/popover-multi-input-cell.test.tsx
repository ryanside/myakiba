import { afterEach, expect, spyOn, test } from "bun:test";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Result } from "better-result";
import { defineCommand, useResourceMutation } from "@/data/client";
import { refusal } from "../../../test/request-answers";
import { Toaster, toast } from "@/components/ui/toast";
import { PopoverMultiInputCell } from "./popover-multi-input-cell";

const command = defineCommand({
  invalidates: ["orders"],
  persist: (_values: Record<string, number>) => refusal("Couldn't save the fees"),
  failureTitle: () => "Couldn't save the fees",
});

function FeesCell() {
  const { run } = useResourceMutation(command);
  return (
    <PopoverMultiInputCell
      inputs={[{ title: "Shipping", type: "currency", value: 1000, name: "shippingFee" }]}
      totalAmount={5000}
      currency="USD"
      locale="en-US"
      onSubmit={run}
    />
  );
}

afterEach(cleanup);

test("a failed fees edit shows one command toast and restores the saved total", async () => {
  const added = spyOn(toast, "add");
  try {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <Toaster>
          <FeesCell />
        </Toaster>
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "$50.00" }));
    fireEvent.change(await screen.findByLabelText("Shipping"), { target: { value: "20.00" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "$50.00" })).toBeTruthy());
    expect(added).toHaveBeenCalledTimes(1);
    expect(added.mock.calls[0]?.[0]).toMatchObject({
      type: "error",
      title: "Couldn't save the fees",
    });
  } finally {
    added.mockRestore();
  }
});

test("a fee too large to save keeps the popover open, marked invalid", async () => {
  const writes: Record<string, number>[] = [];
  render(
    <PopoverMultiInputCell
      inputs={[{ title: "Shipping", type: "currency", value: 1000, name: "shippingFee" }]}
      totalAmount={5000}
      currency="USD"
      locale="en-US"
      onSubmit={async (values) => {
        writes.push(values);
        return Result.ok();
      }}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "$50.00" }));
  fireEvent.change(await screen.findByLabelText("Shipping"), {
    target: { value: "90071992547409.92" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));

  expect(await screen.findByText("Enter an amount like 1,234.50")).toBeTruthy();
  expect(screen.getByLabelText("Shipping").getAttribute("aria-invalid")).toBe("true");
  expect(writes).toEqual([]);
});
