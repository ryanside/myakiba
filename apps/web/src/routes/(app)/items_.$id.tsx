import { createFileRoute, useParams, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { client } from "@/lib/hono-client";
import { addRecentItem } from "@/lib/recent-items";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Package, Tag } from "lucide-react";
import Loader from "@/components/loader";

export const Route = createFileRoute("/(app)/items_/$id")({
  component: RouteComponent,
});

async function getItem(itemId: string) {
  const response = await client.api.items[":itemId"].$get({
    param: { itemId },
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || `HTTP ${response.status}`);
  }
  return response.json();
}

function RouteComponent() {
  const { id } = useParams({ from: "/(app)/items_/$id" });

  const { data, isPending, isError, error } = useQuery({
    queryKey: ["item", id],
    queryFn: () => getItem(id),
    staleTime: 1000 * 60 * 5,
    retry: false,
  });

  // Track recently viewed item
  useEffect(() => {
    if (data?.item) {
      addRecentItem({
        id: data.item.id.toString(),
        type: "collection",
        title: data.item.title,
      });
    }
  }, [data?.item]);

  if (isPending) {
    return (
      <div className="flex flex-col items-center justify-center h-64 space-y-4">
        <Loader />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center h-64 space-y-4">
        <div className="text-lg font-medium text-destructive">
          Error: {error.message}
        </div>
        <Button asChild variant="outline">
          <Link to="/collection">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Collection
          </Link>
        </Button>
      </div>
    );
  }

  const { item } = data;

  return (
    <div className="space-y-6">
      {/* Header Section */}
      <div className="flex items-center space-x-4">
        <Button asChild variant="ghost">
          <Link to="/collection">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Collection
          </Link>
        </Button>
        <h1 className="text-2xl font-bold text-foreground">{item.title}</h1>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Item Image */}
        {item.image && (
          <Card>
            <CardContent className="p-6">
              <img
                src={item.image}
                alt={item.title}
                className="w-full h-auto rounded-lg object-contain"
              />
            </CardContent>
          </Card>
        )}

        {/* Item Details */}
        <Card>
          <CardHeader className="flex flex-row items-center space-y-0 pb-2">
            <div className="flex items-center space-x-2">
              <Package className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-sm font-medium">
                Item Details
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Item ID:</span>
              <span className="text-sm font-medium">{item.id}</span>
            </div>
            {item.category && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Category:</span>
                <Badge variant="secondary">{item.category}</Badge>
              </div>
            )}
            {item.scale && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Scale:</span>
                <span className="text-sm font-medium">{item.scale}</span>
              </div>
            )}
            {item.height && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Height:</span>
                <span className="text-sm font-medium">{item.height} mm</span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Additional Information */}
      {item.version && item.version.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center space-y-0 pb-2">
            <div className="flex items-center space-x-2">
              <Tag className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-sm font-medium">Versions</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {item.version.map((ver) => (
                <Badge key={ver} variant="outline">
                  {ver}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
