import { afterAll, expect, test } from "bun:test";

const realFetch = globalThis.fetch;
const requested: { url: URL; method: string; body: unknown }[] = [];
let respond = () => new Response("Order updated successfully");
globalThis.fetch = Object.assign(
  async (input: string | URL | Request, init?: RequestInit) => {
    const request = new Request(input, init);
    requested.push({
      url: new URL(request.url),
      method: request.method,
      body: request.method === "GET" ? null : await request.json(),
    });
    return respond();
  },
  { preconnect: realFetch.preconnect },
);

const {
  editOrder,
  fillOrderPaid,
  getMergeDraft,
  getNewOrderDraft,
  updateOrderDate,
  updateOrderStatus,
} = await import("./orders");

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

test("a date changed on a Dashboard card names its field, so its Order Items that held the old date follow it", async () => {
  requested.length = 0;
  await updateOrderDate("order-1", "orderDate", "2026-01-06");
  await updateOrderDate("order-1", "paymentDate", "2026-02-20");
  await updateOrderDate("order-1", "shippingDate", null);
  await updateOrderDate("order-1", "collectionDate", "2026-03-09");
  await updateOrderDate("order-1", "releaseDate", "2026-03-01");
  await updateOrderStatus("order-1", "Shipped");

  expect(requested.map(({ body }) => body)).toEqual([
    { order: { orderDate: "2026-01-06" }, cascadeOptions: ["orderDate"] },
    { order: { paymentDate: "2026-02-20" }, cascadeOptions: ["paymentDate"] },
    { order: { shippingDate: null }, cascadeOptions: ["shippingDate"] },
    { order: { collectionDate: "2026-03-09" }, cascadeOptions: ["collectionDate"] },
    { order: { releaseDate: "2026-03-01" }, cascadeOptions: [] },
    { order: { status: "Shipped" }, cascadeOptions: ["status"] },
  ]);
});

test("Paid from a checkbox writes Paid to the Order and every item in it, as an Order fill", async () => {
  requested.length = 0;
  await fillOrderPaid("order-1", true);

  expect(requested.map(({ url, method, body }) => [url.pathname, method, body])).toEqual([
    ["/api/orders/fill", "PUT", { orderIds: ["order-1"], fill: { field: "paid", value: true } }],
  ]);
});

test("the draft reads carry their ids in the body, so a selection of any size fits", async () => {
  requested.length = 0;
  const orderIds = Array.from({ length: 1000 }, (_, i) => `order-${i}`);
  const collectionIds = Array.from({ length: 1000 }, (_, i) => `item-${i}`);
  await getMergeDraft(orderIds);
  await getNewOrderDraft(collectionIds);

  expect(
    requested.map(({ url, method, body }) => [url.pathname, url.search, method, body]),
  ).toEqual([
    ["/api/orders/merge-draft", "", "POST", { orderIds }],
    ["/api/orders/new-order-draft", "", "POST", { collectionIds }],
  ]);
});

test("a New Order draft the server cannot answer says the selected items did not load", async () => {
  respond = () => new Response("Internal Server Error", { status: 500 });
  try {
    const draft = await getNewOrderDraft(["item-1"]);
    expect(draft.isErr() ? draft.error.message : "loaded").toBe(
      "Couldn't load the selected items.",
    );
  } finally {
    respond = () => new Response("Order updated successfully");
  }
});
