import { useOrdersFilters } from "@/hooks/use-orders";
import { ORDER_STATUSES } from "@myakiba/contracts/shared/constants";
import type { OrderStatus } from "@myakiba/contracts/shared/types";
import { QuickFilterChips } from "../quick-filter-chips";

const PAID_CHIPS = { Paid: true, Unpaid: false } as const;
type PaidChip = keyof typeof PAID_CHIPS;
const ARRIVING_CHIP = "Arriving this month";
const ARRIVING_STATUSES: readonly OrderStatus[] = ["Ordered", "Shipped"];
const CHIPS = [...ORDER_STATUSES, "Paid", "Unpaid", ARRIVING_CHIP] as const;

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
  arriving: boolean,
  wasArriving: boolean,
): OrderStatus[] {
  if (arriving && !wasArriving) return [...ARRIVING_STATUSES];
  if (!arriving && wasArriving) {
    return pressed.filter((status) => !ARRIVING_STATUSES.includes(status));
  }
  return [...pressed];
}

export function OrdersQuickFilters(): React.ReactElement {
  const { filters, setFilters } = useOrdersFilters();
  const statuses = filters.status ?? [];
  const current = paidChipOf(filters.paid);
  const wasArriving = filters.releaseMonth === "this";
  const selected = [
    ...statuses,
    ...(current ? [current] : []),
    ...(wasArriving ? [ARRIVING_CHIP] : []),
  ];

  return (
    <QuickFilterChips
      options={CHIPS}
      selected={selected}
      onChange={(chips) => {
        const arriving = chips.includes(ARRIVING_CHIP);
        const nextStatuses = statusesAfter(chips.filter(isStatus), arriving, wasArriving);
        const paidChip = newlyPressedPaidChip(chips.filter(isPaidChip), current);
        setFilters({
          status: nextStatuses.length > 0 ? nextStatuses : undefined,
          paid: paidChip === undefined ? undefined : PAID_CHIPS[paidChip],
          ...(arriving !== wasArriving && {
            releaseMonth: arriving ? "this" : undefined,
            releaseDateStart: undefined,
            releaseDateEnd: undefined,
          }),
          offset: 0,
        });
      }}
    />
  );
}
