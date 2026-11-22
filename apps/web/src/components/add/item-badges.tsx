import { Badge } from "@/components/reui/badge";
import { cn } from "@/lib/utils";

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

export function HeldNote({
  item: { collectionCount, onOrderCount },
  stacked = false,
  className,
}: {
  readonly item: { readonly collectionCount: number; readonly onOrderCount: number };
  /** One place to a line, for a row too narrow to show them after the MFC number. */
  readonly stacked?: boolean;
  readonly className?: string;
}) {
  const places = [
    ...(collectionCount > 0 ? ["In your collection"] : []),
    ...(onOrderCount > 0 ? ["On order"] : []),
  ];
  if (places.length === 0) return null;
  if (stacked) {
    return (
      <span className={cn("text-xs leading-4 text-muted-foreground", className)}>
        {places.map((place) => (
          <span key={place} className="block whitespace-nowrap">
            {place}
          </span>
        ))}
      </span>
    );
  }
  return (
    <span className={cn("min-w-0 truncate text-xs leading-4 text-muted-foreground", className)}>
      {places.join(", ")}
    </span>
  );
}
