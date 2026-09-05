import { StarIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useWishlistItemMutation } from "@/hooks/use-wishlist";

export function WishlistToggleButton({
  itemId,
  itemExternalId,
  isWishlisted,
  disabled = false,
}: {
  readonly itemId: string | undefined;
  readonly itemExternalId: number;
  readonly isWishlisted: boolean;
  readonly disabled?: boolean;
}): React.JSX.Element {
  const mutation = useWishlistItemMutation();
  const label = isWishlisted ? "Remove from Wishlist" : "Add to Wishlist";

  return (
    <Button
      type="button"
      variant="outline"
      size="xs"
      aria-pressed={isWishlisted}
      disabled={disabled || itemId === undefined || mutation.isPending}
      onClick={
        itemId === undefined
          ? undefined
          : () =>
              mutation.mutate({
                itemId,
                itemExternalId,
                wishlisted: !isWishlisted,
              })
      }
    >
      {mutation.isPending ? (
        <Spinner data-icon="inline-start" />
      ) : (
        <HugeiconsIcon
          icon={StarIcon}
          fill={isWishlisted ? "currentColor" : "none"}
          className={isWishlisted ? "text-yellow-400" : undefined}
          data-icon="inline-start"
          aria-hidden="true"
        />
      )}
      {label}
    </Button>
  );
}
