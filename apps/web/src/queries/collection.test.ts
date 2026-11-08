import { afterAll, expect, test } from "bun:test";

const realFetch = globalThis.fetch;
const requested: URL[] = [];
globalThis.fetch = Object.assign(
  async (input: string | URL | Request) => {
    requested.push(new URL(input instanceof Request ? input.url : input));
    return Response.json({ items: [] });
  },
  { preconnect: realFetch.preconnect },
);

const { getCollection } = await import("./collection");

afterAll(() => {
  globalThis.fetch = realFetch;
});

test("a list by ids asks the server for only those Collection Items", async () => {
  await getCollection({ ids: ["collection1", "collection2"] });

  expect(requested[0]?.pathname).toBe("/api/collection");
  expect(requested[0]?.searchParams.getAll("ids")).toEqual(["collection1", "collection2"]);
});
