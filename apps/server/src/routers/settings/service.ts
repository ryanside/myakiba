import { db } from "@/db";
import { budget } from "@/db/schema/figure";
import { eq } from "drizzle-orm";
import type { BudgetUpsertType } from "./model";

class SettingsService {
  async getBudget(userId: string) {
    const [userBudget] = await db
      .select()
      .from(budget)
      .where(eq(budget.userId, userId))
      .limit(1);

    return userBudget;
  }

  async upsertBudget(userId: string, budgetData: BudgetUpsertType) {
    const existingBudget = await this.getBudget(userId);

    if (existingBudget) {
      const [updatedBudget] = await db
        .update(budget)
        .set({
          period: budgetData.period,
          amount: budgetData.amount.toString(),
          updatedAt: new Date(),
        })
        .where(eq(budget.userId, userId))
        .returning();

      return updatedBudget;
    } else {
      const [newBudget] = await db
        .insert(budget)
        .values({
          userId,
          period: budgetData.period,
          amount: budgetData.amount.toString(),
        })
        .returning();

      return newBudget;
    }
  }

  async deleteBudget(userId: string) {
    const deleted = await db
      .delete(budget)
      .where(eq(budget.userId, userId))
      .returning();

    return deleted;
  }
}

export default new SettingsService();
