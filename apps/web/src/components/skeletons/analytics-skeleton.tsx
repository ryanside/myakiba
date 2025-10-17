import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function AnalyticsSkeleton() {
  return (
    <div className="space-y-4">
      {/* Top row: Pie chart + Bar chart */}
      <div className="grid gap-4 md:grid-cols-1 lg:grid-cols-3">
        <Card className="h-[500px]">
          <CardContent className="flex flex-col items-center justify-center h-full gap-12">
            <Skeleton className="h-4 w-32 mr-auto" />
            <Skeleton className="size-48 rounded-full bg-transparent outline-24 outline-border" />
            <div className="space-y-3 w-full mt-auto">
              {[...Array(4)].map((_, i) => (
                <div
                  key={i}
                  className="flex justify-between text-sm items-center"
                >
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-4 w-20" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        <Card className="h-[500px] lg:col-span-2">
          <CardContent className="flex flex-col items-center justify-start h-full gap-12">
            <Skeleton className="h-4 w-32 mr-auto" />
            <Skeleton className="h-64 w-full" />
            <div className="space-y-3 w-full mt-auto">
              {[...Array(4)].map((_, i) => (
                <div
                  key={i}
                  className="flex justify-between text-sm items-center"
                >
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-4 w-20" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Second row: Four cards with progress bars */}
      <div className="grid gap-4 md:grid-cols-1 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-5 w-32" />
            </CardHeader>
            <CardContent className="space-y-4">
              {[...Array(5)].map((_, j) => (
                <div key={j} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Skeleton className="h-4 w-20" />
                    <div className="flex items-center gap-2">
                      <Skeleton className="h-5 w-16" />
                      <Skeleton className="h-4 w-12" />
                    </div>
                  </div>
                  <Skeleton className="h-2 w-full" />
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Bottom row: Three cards for items */}
      <div className="grid gap-4 md:grid-cols-1 lg:grid-cols-3">
        {[...Array(3)].map((_, i) => (
          <Card key={i}>
            <CardHeader className="flex flex-row items-center gap-2">
              <Skeleton className="h-5 w-40" />
            </CardHeader>
            <CardContent className="flex-1">
              <div className="space-y-3">
                {[...Array(5)].map((_, j) => (
                  <div
                    key={j}
                    className="flex items-center gap-3 p-2 rounded-md"
                  >
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
        ))}
      </div>
    </div>
  );
}
