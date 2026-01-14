import { useQuery } from "@tanstack/react-query";
import { getVersion } from "@/queries/version";
import { toast } from "sonner";
import { useRef } from "react";
import { env } from "@myakiba/env/web";

export function useVersionCheck(): void {
  const hasNotified = useRef(false);

  useQuery({
    queryKey: ["version"],
    queryFn: getVersion,
    refetchOnWindowFocus: true,
    refetchInterval: 5 * 60 * 1000, // 5 minutes
    refetchIntervalInBackground: false,
    staleTime: 60 * 1000, // 1 minute
    select: (data) => {
      if (!hasNotified.current && data.buildId !== env.VITE_BUILD_ID) {
        hasNotified.current = true;
        toast.info("A new version is available", {
          description: "Refresh to get the latest updates.",
          duration: Infinity,
          action: {
            label: "Refresh",
            onClick: () => window.location.reload(),
          },
        });
      }
      return data;
    },
  });
}
