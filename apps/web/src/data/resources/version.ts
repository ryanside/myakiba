import { getVersion } from "@/queries/version";
import { rootedRead } from "../client";

export const version = {
  current: rootedRead("version", {
    key: () => ["version"] as const,
    load: getVersion,
    refetchOnWindowFocus: true,
    refetchInterval: 60 * 1000,
    refetchIntervalInBackground: false,
    retry: false,
  }),
};
