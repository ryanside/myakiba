import type { ExpenseOrder } from "../model";
import type { UnpaidOrderPreviewRow } from "./expense-queries";

export function toExpenseOrder(row: UnpaidOrderPreviewRow): ExpenseOrder {
  const feeSpend = row.shipping + row.taxes + row.duties + row.tariffs + row.miscFees;

  return {
    ...row,
    images: [...row.images],
    feeSpend,
    totalSpend: row.itemSpend + feeSpend,
  };
}
