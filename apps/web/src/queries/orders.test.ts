import { afterAll, expect, test } from "bun:test";

const realFetch = globalThis.fetch;
const requested: { url: URL; method: string; body: unknown }[] = [];
globalThis.fetch = Object.assign(
  async (input: string | URL | Request, init?: RequestInit) => {
    const request = new Request(input, init);
    requested.push({
      url: new URL(request.url),
      method: request.method,
      body: await request.json(),
    });
    return new Response("Order updated successfully");
  },
  { preconnect: realFetch.preconnect },
);

const { editOrder, fillOrderPaid } = await import("./orders");

afterAll(() => {
  globalThis.fetch = realFetch;
});

const editable = {
  status: "Shipped",
  paid: true,
  title: "Combined shipment",
  shop: "HLJ",
  orderDate: "2026-01-06",
  releaseDate: null,
  paymentDate: "2026-02-20",
  shippingDate: null,
  collectionDate: null,
  shippingMethod: "EMS",
  shippingFee: 2350,
  taxes: 410,
  duties: 120,
  tariffs: 75,
  miscFees: 30,
  notes: "",
} as const;

test("an Order edit names the Order in the path and sends only the fields a user edits", async () => {
  await editOrder({ orderId: "order-1", ...editable }, ["shop"]);

  expect(requested.map(({ url, method, body }) => [url.pathname, method, body])).toEqual([
    ["/api/orders/order-1", "PUT", { order: editable, cascadeOptions: ["shop"] }],
  ]);
});

test("Paid from a checkbox writes Paid to the Order and every item in it, as an Order fill", async () => {
  requested.length = 0;
  await fillOrderPaid("order-1", true);

  expect(requested.map(({ url, method, body }) => [url.pathname, method, body])).toEqual([
    ["/api/orders/fill", "PUT", { orderIds: ["order-1"], fill: { field: "paid", value: true } }],
  ]);
});
