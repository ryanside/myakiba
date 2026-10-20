import { useQueryClient } from "@tanstack/react-query";

/** Drops every cached read, for when the signed-in account changes or goes away. */
export function useClearServerData() {
  const queryClient = useQueryClient();
  return () => queryClient.clear();
}
