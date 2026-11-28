import { HugeiconsIcon } from "@hugeicons/react";
import { mfcItemUrl } from "@myakiba/contracts/add/constants";
import { DropdownMenuLinkItem } from "@/components/ui/dropdown-menu";
import { ExternalIcon } from "@/lib/icons";

export function OpenOnMfcMenuItem({
  externalId,
}: {
  readonly externalId: number | null;
}): React.JSX.Element | null {
  if (externalId === null) return null;
  return (
    <DropdownMenuLinkItem href={mfcItemUrl(externalId)} target="_blank" rel="noopener noreferrer">
      <HugeiconsIcon icon={ExternalIcon} />
      Open on MFC
    </DropdownMenuLinkItem>
  );
}
