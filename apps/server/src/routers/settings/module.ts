import { and, eq } from "drizzle-orm";
import { account } from "@myakiba/db/schema/auth";
import { ok, query } from "@/domain/kernel";

export const Settings = {
  accountType: query(
    { action: "settings.getAccountType", failure: "Failed to check account type" },
    async (scope) => {
      const [credentialAccount] = await scope.tx
        .select()
        .from(account)
        .where(and(eq(account.userId, scope.viewer.userId), eq(account.providerId, "credential")))
        .limit(1);

      return ok({ hasCredentialAccount: !!credentialAccount });
    },
  ),
};
