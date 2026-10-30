import { Badge } from "@/components/reui/badge";

/** What the viewer already has for an Item. */
export function ItemBadges({
  collectionCount,
  wishlisted,
}: {
  readonly collectionCount: number;
  readonly wishlisted: boolean;
}) {
  return (
    <>
      {collectionCount > 0 ? (
        <Badge variant="secondary" size="sm">
          In your collection{collectionCount > 1 ? ` (${collectionCount})` : ""}
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
