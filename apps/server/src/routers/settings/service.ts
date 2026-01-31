import { db } from "@myakiba/db";
import { budget } from "@myakiba/db/schema/figure";
import { account, user } from "@myakiba/db/schema/auth";
import { eq, and } from "drizzle-orm";
import type { BudgetUpsertType } from "./model";

class SettingsService {
  async getBudget(userId: string) {
    const [userBudget] = await db.select().from(budget).where(eq(budget.userId, userId)).limit(1);

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
    const deleted = await db.delete(budget).where(eq(budget.userId, userId)).returning();

    return deleted;
  }

  async hasCredentialAccount(userId: string): Promise<boolean> {
    const [credentialAccount] = await db
      .select()
      .from(account)
      .where(and(eq(account.userId, userId), eq(account.providerId, "credential")))
      .limit(1);

    return !!credentialAccount;
  }

  async deleteUser(userId: string): Promise<void> {
    await db.delete(user).where(eq(user.id, userId));
  }
}

export default new SettingsService();
