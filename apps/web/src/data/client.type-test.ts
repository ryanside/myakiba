import { defineCommand } from "./client";
import { wishlist } from "./resources/wishlist";

const persist = async (itemId: string) => itemId;
const failureTitle = () => "Failed";

defineCommand({ invalidates: ["wishlist"], persist, failureTitle });

// @ts-expect-error -- a write declares the families it refreshes.
defineCommand({ persist, failureTitle });

// @ts-expect-error -- a write refreshes at least one family.
defineCommand({ invalidates: [], persist, failureTitle });

// @ts-expect-error -- only cataloged families exist.
defineCommand({ invalidates: ["wishlists"], persist, failureTitle });

// @ts-expect-error -- a live stream is never refreshed by a write.
defineCommand({ invalidates: ["syncJobStatus"], persist, failureTitle });

// @ts-expect-error -- the dated views need the day they were read on.
wishlist.items.key({ releaseStatus: "upcoming" });

// @ts-expect-error -- every read takes the whole request input.
wishlist.items.options({ releaseStatus: "all" });
