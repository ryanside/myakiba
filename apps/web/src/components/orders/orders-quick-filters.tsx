import { useOrdersFilters } from "@/hooks/use-orders";
import { ORDER_STATUSES } from "@myakiba/contracts/shared/constants";
import type { OrderStatus } from "@myakiba/contracts/shared/types";
import { QuickFilterChips } from "../quick-filter-chips";

const PAID_CHIPS = { Paid: true, Unpaid: false } as const;
type PaidChip = keyof typeof PAID_CHIPS;
const OVERDUE = "Overdue";
const CHIPS = [...ORDER_STATUSES, "Paid", "Unpaid", OVERDUE] as const;

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

export function OrdersQuickFilters(): React.ReactElement {
  const { filters, setFilters } = useOrdersFilters();
  const statuses = filters.status ?? [];
  const current = paidChipOf(filters.paid);
  const selected = [
    ...statuses,
    ...(current ? [current] : []),
    ...(filters.overdue === true ? [OVERDUE] : []),
  ];

  return (
    <QuickFilterChips
      options={CHIPS}
      selected={selected}
      onChange={(chips) => {
        const nextStatuses = chips.filter(isStatus);
        const paidChip = newlyPressedPaidChip(chips.filter(isPaidChip), current);
        setFilters({
          status: nextStatuses.length > 0 ? nextStatuses : undefined,
          paid: paidChip === undefined ? undefined : PAID_CHIPS[paidChip],
          overdue: chips.includes(OVERDUE) ? true : undefined,
          offset: 0,
        });
      }}
    />
  );
}
