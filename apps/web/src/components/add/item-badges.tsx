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
