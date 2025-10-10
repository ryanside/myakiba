import type { CollectionItem } from "@/lib/collection/types";

export type ItemRelatedCollection = {
  collection: Omit<
    CollectionItem,
    | "itemCategory"
    | "itemScale"
    | "createdAt"
    | "updatedAt"
    | "totalCount"
    | "totalValue"
  >[];
};
