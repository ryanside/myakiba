import { expect, test } from "bun:test";
import { orderDraft } from "./order-draft";

test("a draft of no sources is unpaid", () => {
  expect(orderDraft([]).paid).toBe(false);
});
