import { Failure } from "@/domain/failure";

export class WishlistItemNotFound extends Failure(
  "WishlistItemNotFound",
  "not_found",
  "Wishlist Item not found",
) {}
