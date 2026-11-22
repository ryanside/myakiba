import type { RenameShop } from "@myakiba/contracts/vocabulary/schema";
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

const renameShops = (rename: RenameShop) =>
  call(app.api.vocabulary.shops.rename.post(rename), {
    fallback: "Failed to rename the shop",
    empty: "Failed to rename the shop",
  });

export const renameShopsCommand = defineCommand({
  invalidates: collectionWriteFamilies,
  refetchBy: "settled",
  persist: renameShops,
  successTitle: ({ to }) => `Saved as “${to.trim()}”`,
  successDescription: (_input, renamed) => `${describeUses(renamed)} changed.`,
  failureToast: messageAs("description", ({ to }: RenameShop) => `Couldn't save “${to.trim()}”`),
});
