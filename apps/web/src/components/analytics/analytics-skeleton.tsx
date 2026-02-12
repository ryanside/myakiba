import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function AnalyticsSkeleton() {
  return (
    <div className="flex flex-col gap-12 mx-auto">
      {/* Header section */}
      <div className="flex flex-col gap-2">
        <div className="flex flex-row items-start gap-4">
          <h1 className="text-2xl tracking-tight">Collection Analytics</h1>
        </div>
        <p className="text-muted-foreground text-sm font-light">
          See how your collection is distributed across different categories.
        </p>
      </div>

      {/* Grid of analytics cards */}
      <div className="grid gap-6 md:grid-cols-1 lg:grid-cols-2">
        {/* Multiple cards with progress bars - representing different analytics sections */}
        {[...Array(9)].map((_, cardIndex) => (
          <Card key={cardIndex} className="min-h-[620px]">
            <CardHeader>
              <Skeleton className="h-5 w-32" />
            </CardHeader>
            <CardContent className="space-y-4">
              {[...Array(5)].map((_, itemIndex) => (
                <div key={itemIndex} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Skeleton className="h-4 w-24" />
                    <div className="flex items-center gap-2">
                      <Skeleton className="h-5 w-16" />
                      <Skeleton className="h-4 w-16" />
                    </div>
                  </div>
                  <Skeleton className="h-2 w-full" />
                </div>
              ))}
            </CardContent>
          </Card>
        ))}

        {/* Most Expensive Items card with image thumbnails */}
        <Card>
          <CardHeader className="flex flex-row items-center gap-2">
            <Skeleton className="h-5 w-40" />
          </CardHeader>
          <CardContent className="flex-1">
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex items-center gap-3 p-2 rounded-md">
                  <Skeleton className="h-12 w-12 rounded-md flex-shrink-0" />
                  <div className="flex-1 min-w-0 space-y-2">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-3 w-20" />
                    <Skeleton className="h-3 w-16" />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Coming Soon card */}
        <Card className="flex flex-row items-center justify-center bg-transparent border-none">
          <CardHeader className="flex flex-row items-center justify-center">
            <Skeleton className="h-5 w-64" />
          </CardHeader>
        </Card>
      </div>
    </div>
  );
}
