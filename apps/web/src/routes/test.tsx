import { createFileRoute } from "@tanstack/react-router";
import { authClient } from "@/lib/auth-client";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { client } from "@/lib/hono-client";
import { Button } from "@/components/ui/button";

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

  const {
    data: summary,
    isPending: isSummaryPending,
    refetch,
  } = useQuery({
    queryKey: ["summary"],
    queryFn: getSummary,
    enabled: false,
    retry: false,
  });

  const handleClick = async () => {
    await refetch();
  };

  async function getSummary() {
    const response = await client.api.manager[":id"].$get({
      param: {
        id: "1",
      },
    });
    if (!response.ok) {
      throw new Error("Failed to get collection size");
    }

    const data = await response.json();
    console.log(JSON.stringify(data, null, 2));

    return data;
  }

  return (
    <div>
      <Button onClick={handleClick}>Test API</Button>
    </div>
  );
}
