import { afterEach, expect, test } from "bun:test";
import { createList } from "./lists";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

test.each([400, 503])("a failed List save preserves its existing %d message", async (status) => {
  globalThis.fetch = Object.assign(async () => new Response("Server detail", { status }), {
    preconnect: realFetch.preconnect,
  });
  await expect(createList({ title: "My List", description: "" })).rejects.toMatchObject({
    message: status === 400 ? "Server detail" : "Failed to create list",
  });
});
