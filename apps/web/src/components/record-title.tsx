import type { ReactNode } from "react";

export function RecordTitle({
  kind,
  title,
}: {
  readonly kind: "Order" | "Item" | "List" | "Item Entry";
  readonly title?: string | undefined;
}): ReactNode {
  return <title>{`${title?.trim() || kind} - myakiba`}</title>;
}
