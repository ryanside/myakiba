import { getAccountType } from "@/queries/settings";
import { rootedRead } from "../client";

export const settings = {
  accountType: rootedRead("accountType", {
    key: () => ["account-type"] as const,
    load: getAccountType,
    staleTime: 1000 * 60 * 5,
    retry: false,
  }),
};
