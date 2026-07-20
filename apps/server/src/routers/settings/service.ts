import { db } from "@myakiba/db/client";
import { account } from "@myakiba/db/schema/auth";
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
}

export default new SettingsService();
