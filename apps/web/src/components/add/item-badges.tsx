import { Badge } from "@/components/reui/badge";

type Held = { readonly collectionCount: number; readonly onOrderCount: number };

/** The viewer's Collection Items of an Item: those owned, then those still on order. */
function heldLabels({ collectionCount, onOrderCount }: Held): readonly string[] {
  const counted = (label: string, count: number) =>
    count === 0 ? [] : [count > 1 ? `${label} (${count})` : label];
  return [...counted("In your collection", collectionCount), ...counted("On order", onOrderCount)];
}

/** What the viewer already has for an Item. */
export function ItemBadges({ item }: { readonly item: Held & { readonly wishlisted: boolean } }) {
  return (
    <>
      {heldLabels(item).map((label) => (
        <Badge key={label} variant="secondary" size="sm">
          {label}
        </Badge>
      ))}
      {item.wishlisted ? (
        <Badge variant="outline" size="sm">
          On your Wishlist
        </Badge>
      ) : null}
    </>
  );
}

/** The same Collection Items as text, for a line that keeps its height. */
export function HeldNote({ item }: { readonly item: Held }) {
  const labels = heldLabels(item);
  if (labels.length === 0) return null;
  return (
    <span className="min-w-0 truncate text-xs leading-4 text-muted-foreground">
      {labels.join(", ")}
    </span>
  );
}
