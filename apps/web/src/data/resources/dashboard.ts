import type { OrderStatus } from "@myakiba/contracts/shared/types";
import { getDashboard, getMonthlyDashboard } from "@/queries/dashboard";
import { updateOrderDate, updateOrderStatus } from "@/queries/orders";
import type { OrderDateField } from "@/queries/orders";
import { collectionWriteFamilies } from "../catalog";
import { defineCommand, rootedRead } from "../client";

type Month = { readonly month: number; readonly year: number };

export const dashboard = {
  overview: rootedRead("dashboard", {
    key: () => ["dashboard"] as const,
    load: getDashboard,
    staleTime: 1000 * 60 * 5,
    retry: false,
  }),
  monthly: rootedRead("dashboard", {
    key: ({ month, year }: Month) => ["dashboard", "monthly", month, year] as const,
    load: ({ month, year }) => getMonthlyDashboard(month, year),
    staleTime: 1000 * 60 * 5,
    retry: false,
  }),
};

/** The Kanban queues each card's writes and refetches once the card's queue drains. */
export const updateKanbanOrderStatusCommand = defineCommand({
  invalidates: collectionWriteFamilies,
  refetchBy: "caller",
  persist: ({ orderId, status }: { readonly orderId: string; readonly status: OrderStatus }) =>
    updateOrderStatus(orderId, status),
  successTitle: ({ status }) => (status === "Owned" ? "Order marked as collected" : undefined),
  failureTitle: (_input, error) => error.message,
});

export const updateKanbanOrderDateCommand = defineCommand({
  invalidates: collectionWriteFamilies,
  refetchBy: "caller",
  persist: ({
    orderId,
    field,
    date,
  }: {
    readonly orderId: string;
    readonly field: OrderDateField;
    readonly date: string | null;
  }) => updateOrderDate(orderId, field, date),
  failureTitle: () => "Failed to update date",
  failureDescription: (_input, error) => error.message,
});
