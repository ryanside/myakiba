import { describe, expect, mock, test } from "bun:test";
import { initLogger } from "evlog";
import * as z from "zod";
import { commaSeparatedStringArraySchema } from "@myakiba/contracts/search/query-params";

initLogger({ enabled: false });

await mock.module("@myakiba/auth/server", () => ({
  auth: {
    handler: () => new Response(null, { status: 404 }),
    api: {
      getSession: async () => ({ user: { id: "user-1" }, session: { id: "session-1" } }),
    },
  },
}));

const { privateApi } = await import("./private-api");

const app = privateApi("/probe").get("/", ({ query }) => query, {
  query: z.object({
    search: z.string().optional(),
    shop: commaSeparatedStringArraySchema,
  }),
});

const probe = async (queryString: string) => {
  const response = await app.handle(new Request(`http://localhost/probe?${queryString}`));
  return { status: response.status, body: await response.json() };
};

describe("a free-text query value reaches the route as the text the client sent", () => {
  test.each([
    ["search=%2C", ","],
    ["search=a,b", "a,b"],
    ["search=a%2Cb", "a,b"],
    ["search=%5B1%5D", "[1]"],
    ["search=%7B%7D", "{}"],
    ["search=a+b", "a b"],
  ])("%s", async (queryString, search) => {
    expect(await probe(queryString)).toEqual({ status: 200, body: { search } });
  });
});

describe("an array query value still arrives as a list", () => {
  test.each([
    ["shop=a", ["a"]],
    ["shop=a,b", ["a", "b"]],
    ["shop=a&shop=b", ["a", "b"]],
  ])("%s", async (queryString, shop) => {
    expect(await probe(queryString)).toEqual({ status: 200, body: { shop } });
  });
});
