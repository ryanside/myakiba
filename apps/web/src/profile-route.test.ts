import { expect, mock, test } from "bun:test";
import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";

await mock.module("@/lib/changelog", () => ({
  changelogEntries: [],
  formatChangelogDate: (value: string) => value,
  loadChangelogEntry: () => null,
}));
const { routeTree } = await import("@/routeTree.gen");

test("/profile/x matches no page, so it shows the not-found page", () => {
  const router = createRouter({
    routeTree,
    context: {
      queryClient: new QueryClient(),
      readSession: async () => ({ session: null, unavailable: false }),
    },
  });
  const [matchedRoutes, , foundRoute] = router.getMatchedRoutes("/profile/x");
  expect(foundRoute?.id).toBeUndefined();
  expect(matchedRoutes.map((route) => route.id)).toEqual(["__root__"]);
});
