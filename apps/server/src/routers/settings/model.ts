import * as z from "zod";

export const budgetUpsertSchema = z.object({
  period: z.enum(["monthly", "annual", "allocated"]),
  amount: z.coerce.number().min(0, "Amount must be at least 0"),
});

export type BudgetUpsertType = z.infer<typeof budgetUpsertSchema>;
