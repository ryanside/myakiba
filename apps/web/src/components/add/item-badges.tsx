import { Badge } from "@/components/reui/badge";

/** What the viewer already has for an Item. */
export function ItemBadges({
  item: { collectionCount, onOrderCount, wishlisted },
}: {
  readonly item: {
    readonly collectionCount: number;
    readonly onOrderCount: number;
    readonly wishlisted: boolean;
  };
}) {
  return (
    <>
      {collectionCount > 0 ? (
        <Badge variant="secondary" size="sm">
          In your collection{collectionCount > 1 ? ` (${collectionCount})` : ""}
        </Badge>
      ) : null}
      {onOrderCount > 0 ? (
        <Badge variant="secondary" size="sm">
          On order{onOrderCount > 1 ? ` (${onOrderCount})` : ""}
        </Badge>
      ) : null}
      {wishlisted ? (
        <Badge variant="outline" size="sm">
          On your Wishlist
        </Badge>
      ) : null}
    </>
  );
}

/** Where the viewer already has an Item, for a row that keeps its height. */
export function HeldNote({
  item: { collectionCount, onOrderCount },
}: {
  readonly item: { readonly collectionCount: number; readonly onOrderCount: number };
}) {
  const places = [
    ...(collectionCount > 0 ? ["In your collection"] : []),
    ...(onOrderCount > 0 ? ["On order"] : []),
  ];
  if (places.length === 0) return null;
  return (
    <span className="min-w-0 truncate text-xs leading-4 text-muted-foreground">
      {places.join(", ")}
    </span>
  );
}
