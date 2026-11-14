import type { ShopUses } from "@myakiba/contracts/vocabulary/schema";
import { Result } from "better-result";
import { describeUses } from "@/lib/vocabulary-suggestions";
import { app } from "@/lib/treaty-client";
import { call } from "../api";
import { collectionWriteFamilies } from "../catalog";
import { defineCommand, messageAs, rootedRead } from "../client";

export const vocabulary = rootedRead("vocabulary", {
  key: () => ["vocabulary"] as const,
  load: () =>
    call(app.api.vocabulary.get(), {
      fallback: "Failed to load your suggestions",
      empty: "Failed to load your suggestions",
    }),
  staleTime: 1000 * 60 * 5,
  retry: false,
});

type ShopRename = { readonly from: readonly string[]; readonly to: string };

async function renameShops({ from, to }: ShopRename) {
  const total = { collectionItems: 0, orders: 0 };
  for (const shop of from) {
    const renamed = await call(app.api.vocabulary.shops.rename.post({ from: shop, to }), {
      fallback: `Couldn't rename “${shop}”`,
      empty: `Couldn't rename “${shop}”`,
    });
    if (renamed.isErr()) return renamed;
    total.collectionItems += renamed.value.collectionItems;
    total.orders += renamed.value.orders;
  }
  return Result.ok<ShopUses>(total);
}

export const renameShopsCommand = defineCommand({
  invalidates: collectionWriteFamilies,
  refetchBy: "settled",
  persist: renameShops,
  successTitle: ({ to }) => `Saved as “${to.trim()}”`,
  successDescription: (_input, renamed) => `${describeUses(renamed)} changed.`,
  failureToast: messageAs("description", ({ to }: ShopRename) => `Couldn't save “${to.trim()}”`),
});
