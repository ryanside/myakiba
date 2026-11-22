import { useOrdersFilters } from "@/hooks/use-orders";
import { ORDER_STATUSES } from "@myakiba/contracts/shared/constants";
import type { OrderFilters } from "@myakiba/contracts/orders/schema";
import type { OrderStatus } from "@myakiba/contracts/shared/types";
import { QuickFilterChips } from "../quick-filter-chips";

const PAYMENT_CHIPS = {
  Paid: { paid: true, feesPaid: undefined },
  Unpaid: { paid: false, feesPaid: undefined },
  "Fees paid": { paid: undefined, feesPaid: true },
  "Fees unpaid": { paid: undefined, feesPaid: false },
} as const satisfies Record<string, Pick<OrderFilters, "paid" | "feesPaid">>;
type PaymentChip = keyof typeof PAYMENT_CHIPS;

const isStatus = (chip: string): chip is OrderStatus =>
  ORDER_STATUSES.some((status) => status === chip);
const isPaymentChip = (chip: string): chip is PaymentChip => chip in PAYMENT_CHIPS;

function paymentChipsOf({ paid, feesPaid }: OrderFilters): PaymentChip[] {
  const chips: PaymentChip[] = [];
  if (paid !== undefined) chips.push(paid ? "Paid" : "Unpaid");
  if (feesPaid !== undefined) chips.push(feesPaid ? "Fees paid" : "Fees unpaid");
  return chips;
}

function nextPaymentChips(
  pressed: readonly PaymentChip[],
  current: readonly PaymentChip[],
): readonly PaymentChip[] {
  const newlyPressed = pressed.find((chip) => !current.includes(chip));
  return newlyPressed === undefined ? pressed : [newlyPressed];
}

export function OrdersQuickFilters(): React.ReactElement {
  const { filters, setFilters } = useOrdersFilters();
  const statuses = filters.status ?? [];
  const current = paymentChipsOf(filters);
  const linkOnly = current.filter((chip) => chip !== "Paid" && chip !== "Unpaid");

  return (
    <QuickFilterChips
      options={[...ORDER_STATUSES, "Paid", "Unpaid", ...linkOnly]}
      selected={[...statuses, ...current]}
      onChange={(chips) => {
        const nextStatuses = chips.filter(isStatus);
        const payment = nextPaymentChips(chips.filter(isPaymentChip), current);
        setFilters({
          status: nextStatuses.length > 0 ? nextStatuses : undefined,
          paid: payment.map((chip) => PAYMENT_CHIPS[chip].paid).find((v) => v !== undefined),
          feesPaid: payment
            .map((chip) => PAYMENT_CHIPS[chip].feesPaid)
            .find((v) => v !== undefined),
          offset: 0,
        });
      }}
    />
  );
}
