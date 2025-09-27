import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getAnalytics } from "@/queries/analytics";

export const Route = createFileRoute("/(app)/analytics")({
  component: RouteComponent,
});

function RouteComponent() {
  const { isPending, isError, data, error } = useQuery({
    queryKey: ["analytics"],
    queryFn: getAnalytics,
    staleTime: Infinity,
    retry: false,
  });

  if (isPending) {
    return <div>Loading...</div>;
  }

  if (isError) {
    return <div>Error: {error.message}</div>;
  }

  const { analytics } = data;

  return <div>Hello "/analytics"!</div>;
}
