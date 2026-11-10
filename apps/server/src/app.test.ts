import { afterAll, expect, test } from "bun:test";
import { initLogger } from "evlog";

initLogger({ enabled: false });
const { createApp } = await import("./app");
const app = createApp({ drain: undefined, authDocs: undefined });
const server = createApp({ drain: undefined, authDocs: undefined }).listen({
  hostname: "127.0.0.1",
  port: 0,
});
afterAll(() => server.stop(true));

const SIGNED_IN = { cookie: "better-auth.session_token=not-checked-yet" };
const MB = 1024 * 1024;

test("a signed-out upload answers 401 before its body is read", async () => {
  let read = false;
  const body = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        read = true;
        controller.enqueue(new TextEncoder().encode("{}"));
        controller.close();
      },
    },
    { highWaterMark: 0 },
  );
  const response = await app.handle(
    new Request("http://localhost/api/mfc-items", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      duplex: "half",
    }),
  );
  expect({ status: response.status, read }).toEqual({ status: 401, read: false });
});

test("a request without a session cookie still reaches the public routes", async () => {
  const response = await app.handle(new Request("http://localhost/api/version"));
  expect(response.status).toBe(200);
});

test("a body over the largest legitimate upload is refused before it is read", async () => {
  const response = await fetch(`http://127.0.0.1:${server.server?.port}/api/mfc-items`, {
    method: "POST",
    headers: { ...SIGNED_IN, "content-type": "application/octet-stream" },
    body: new Uint8Array(13 * MB),
  });
  expect(response.status).toBe(413);
});

test("a full-size Item upload gets past the body limit to validation", async () => {
  const body = new FormData();
  body.set("page", new File([new Uint8Array(2 * MB)], "page.html", { type: "text/html" }));
  body.set("picture", new File([new Uint8Array(10 * MB)], "picture.jpg", { type: "image/jpeg" }));
  const response = await fetch(`http://127.0.0.1:${server.server?.port}/api/mfc-items`, {
    method: "POST",
    headers: SIGNED_IN,
    body,
  });
  expect(response.status).toBe(422);
});

test("an Order with notes over 10000 characters answers 422", async () => {
  const response = await app.handle(
    new Request("http://localhost/api/orders/order-1", {
      method: "PUT",
      headers: { ...SIGNED_IN, "content-type": "application/json" },
      body: JSON.stringify({ order: { notes: "n".repeat(10_001) }, cascadeOptions: [] }),
    }),
  );
  expect(response.status).toBe(422);
});
