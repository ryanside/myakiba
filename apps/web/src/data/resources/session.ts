import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

/** Drops every cached read, for when the signed-in account goes away. */
export function useClearServerData() {
  const queryClient = useQueryClient();
  return useCallback(() => queryClient.clear(), [queryClient]);
}

/** Empties every cached read and refetches the ones on screen, for when another account signs in. */
export function useResetServerData() {
  const queryClient = useQueryClient();
  return useCallback(() => queryClient.resetQueries(), [queryClient]);
}
