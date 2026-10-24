import { afterEach, expect, test } from "bun:test";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Toaster } from "@/components/ui/toast";
import { PopoverMultiInputCell } from "./popover-multi-input-cell";

afterEach(cleanup);

test("toasts the save error and shows the saved total again when saving the fees fails", async () => {
  render(
    <Toaster>
      <PopoverMultiInputCell
        inputs={[{ title: "Shipping", type: "currency", value: 1000, name: "shippingFee" }]}
        totalAmount={5000}
        currency="USD"
        locale="en-US"
        onSubmit={() => Promise.reject(new Error("Couldn't save the fees"))}
      />
    </Toaster>,
  );

  fireEvent.click(screen.getByRole("button", { name: "$50.00" }));
  fireEvent.change(await screen.findByLabelText("Shipping"), { target: { value: "20.00" } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));

  expect(await screen.findByText("Couldn't save the fees")).toBeTruthy();
  expect(screen.getByRole("button", { name: "$50.00" })).toBeTruthy();
});
