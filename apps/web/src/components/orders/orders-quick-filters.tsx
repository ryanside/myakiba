import { useOrdersFilters } from "@/hooks/use-orders";
import { ORDER_STATUSES } from "@myakiba/contracts/shared/constants";
import type { OrderStatus } from "@myakiba/contracts/shared/types";
import { QuickFilterChips } from "../quick-filter-chips";

const PAID_CHIPS = { Paid: true, Unpaid: false } as const;
type PaidChip = keyof typeof PAID_CHIPS;
const RELEASING_CHIP = "Releasing this month";
const RELEASING_STATUSES: readonly OrderStatus[] = ["Ordered", "Shipped"];
const CHIPS = [...ORDER_STATUSES, "Paid", "Unpaid", RELEASING_CHIP] as const;

const isStatus = (chip: string): chip is OrderStatus =>
  ORDER_STATUSES.some((status) => status === chip);
const isPaidChip = (chip: string): chip is PaidChip => chip in PAID_CHIPS;

function paidChipOf(paid: boolean | undefined): PaidChip | undefined {
  if (paid === undefined) return undefined;
  return paid ? "Paid" : "Unpaid";
}

function newlyPressedPaidChip(
  pressed: readonly PaidChip[],
  current: PaidChip | undefined,
): PaidChip | undefined {
  return pressed.find((chip) => chip !== current) ?? pressed[0];
}

function statusesAfter(
  pressed: readonly OrderStatus[],
  releasing: boolean,
  wasReleasing: boolean,
): OrderStatus[] {
  if (releasing && !wasReleasing) return [...RELEASING_STATUSES];
  if (!releasing && wasReleasing) {
    return pressed.filter((status) => !RELEASING_STATUSES.includes(status));
  }
  return [...pressed];
}

export function OrdersQuickFilters(): React.ReactElement {
  const { filters, setFilters } = useOrdersFilters();
  const statuses = filters.status ?? [];
  const current = paidChipOf(filters.paid);
  const wasReleasing =
    filters.releaseMonth === "this" &&
    statuses.length === RELEASING_STATUSES.length &&
    RELEASING_STATUSES.every((status) => statuses.includes(status));
  const selected = [
    ...statuses,
    ...(current ? [current] : []),
    ...(wasReleasing ? [RELEASING_CHIP] : []),
  ];

  return (
    <QuickFilterChips
      options={CHIPS}
      selected={selected}
      onChange={(chips) => {
        const releasing = chips.includes(RELEASING_CHIP);
        const nextStatuses = statusesAfter(chips.filter(isStatus), releasing, wasReleasing);
        const paidChip = newlyPressedPaidChip(chips.filter(isPaidChip), current);
        setFilters({
          status: nextStatuses.length > 0 ? nextStatuses : undefined,
          paid: paidChip === undefined ? undefined : PAID_CHIPS[paidChip],
          ...(releasing !== wasReleasing && {
            releaseMonth: releasing ? "this" : undefined,
            releaseDateStart: undefined,
            releaseDateEnd: undefined,
          }),
          offset: 0,
        });
      }}
    />
  );
}
