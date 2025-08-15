import { createFileRoute } from "@tanstack/react-router";
import { authClient } from "@/lib/auth-client";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { client } from "@/lib/hono-client";

export const Route = createFileRoute("/test")({
  component: RouteComponent,
});

function RouteComponent() {
  const { data: session, isPending } = authClient.useSession();
  const navigate = Route.useNavigate();

  useEffect(() => {
    // Add a small delay to avoid race condition with sign-in
    const timeoutId = setTimeout(() => {
      if (!session && !isPending) {
        navigate({
          to: "/login",
        });
      }
    }, 100);

    return () => clearTimeout(timeoutId);
  }, [session, isPending, navigate]);

  const { data: summary, isPending: isSummaryPending } = useQuery({
    queryKey: ["summary"],
    queryFn: getSummary,
  });
  console.log(JSON.stringify(summary, null, 2));

  async function getSummary() {
    const response = await client.api.reports["price-distribution"].$get({
      query: {
        currency: "USD",
      },
    });
    if (!response.ok) {
      throw new Error("Failed to get collection size");
    }
    return response.json();
  }

  return <div>Hello "/test"!</div>;
}
