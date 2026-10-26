export type ItemDestination =
  | { readonly to: "/item/$externalId"; readonly params: { readonly externalId: number } }
  | { readonly to: "/item/custom/$id"; readonly params: { readonly id: string } };

// A catalogue item opens by its MyFigureCollection id, and a custom item, which has none, by its own.
export function itemDestination(itemId: string, externalId: number | null): ItemDestination {
  return externalId === null
    ? { to: "/item/custom/$id", params: { id: itemId } }
    : { to: "/item/$externalId", params: { externalId } };
}
