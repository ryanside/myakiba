import { db } from "@myakiba/db";
import { account, user } from "@myakiba/db/schema/auth";
import { eq, and } from "drizzle-orm";

class SettingsService {
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
