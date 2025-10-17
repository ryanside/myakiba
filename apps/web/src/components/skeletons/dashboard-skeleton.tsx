import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function DashboardSkeleton() {
  return (
    <div className="space-y-4">
      {/* Stat cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <Card key={i}>
            <CardHeader className="flex flex-row items-center gap-2">
              <Skeleton className="h-4 w-4" />
              <Skeleton className="h-4 w-24" />
            </CardHeader>
            <CardContent>
              <div className="flex flex-row items-baseline gap-2">
                <Skeleton className="h-8 w-20" />
                <Skeleton className="h-4 w-16" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts row */}
      <div className="grid gap-4 md:grid-cols-1 lg:grid-cols-3">
        {/* Pie chart */}
        <Card className="">
          <CardContent className="flex flex-col items-center justify-center h-full gap-10">
            <Skeleton className="h-4 w-32 mr-auto" />
            <Skeleton className="size-44 rounded-full bg-transparent outline-24 outline-border" />
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

        {/* Bar chart */}
        <Card className="">
          <CardContent className="flex flex-col items-center justify-center h-full gap-4">
            <Skeleton className="h-4 w-32 mr-auto" />
            <Skeleton className="size-48 w-full" />
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

        {/* Orders summary */}
        <Card className="col-span-1">
          <CardHeader className="flex flex-row items-center gap-2">
            <Skeleton className="h-4 w-4" />
            <Skeleton className="h-5 w-32" />
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[...Array(8)].map((_, i) => (
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
          <div className="flex justify-between items-center mt-auto px-6 pb-6">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-24" />
          </div>
        </Card>
      </div>

      {/* Orders and activity */}
      <div className="grid gap-4 md:grid-cols-1 lg:grid-cols-3 lg:grid-rows-2">
        {/* Orders card - spans 2 columns and 2 rows */}
        <Card className="lg:col-span-2 lg:row-span-2">
          <CardHeader className="flex flex-row items-center gap-2">
            <Skeleton className="h-4 w-4" />
            <Skeleton className="h-5 w-24" />
          </CardHeader>
          <CardContent className="flex-1">
            <div className="grid gap-4 md:grid-cols-1 lg:grid-cols-2">
              {[...Array(4)].map((_, i) => (
                <Card key={i}>
                  <CardHeader>
                    <Skeleton className="h-5 w-full mb-2" />
                    <Skeleton className="h-4 w-3/4" />
                  </CardHeader>
                  <CardContent className="mt-auto">
                    <div className="flex gap-2 mb-3">
                      {[...Array(3)].map((_, j) => (
                        <Skeleton key={j} className="h-16 w-16 rounded-md" />
                      ))}
                    </div>
                    <div className="flex items-center gap-2">
                      <Skeleton className="h-4 w-4" />
                      <Skeleton className="h-4 w-16" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Upcoming releases */}
        <Card className="lg:col-span-1 lg:row-span-1 flex flex-col">
          <CardHeader className="flex flex-row items-center gap-2">
            <Skeleton className="h-4 w-4" />
            <Skeleton className="h-5 w-36" />
          </CardHeader>
          <CardContent className="flex-1">
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="flex items-center gap-3 p-2 rounded-md">
                  <Skeleton className="h-12 w-12 rounded-md flex-shrink-0" />
                  <div className="flex-1 min-w-0 space-y-2">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-3 w-20" />
                    <Skeleton className="h-3 w-32" />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Activity */}
        <Card className="lg:col-span-1 lg:row-span-1 flex flex-col">
          <CardHeader className="flex flex-row items-center gap-2">
            <Skeleton className="h-4 w-4" />
            <Skeleton className="h-5 w-24" />
          </CardHeader>
          <CardContent className="flex-1">
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="flex items-center gap-3 p-2 rounded-md">
                  <Skeleton className="h-12 w-12 rounded-md flex-shrink-0" />
                  <div className="min-w-0 space-y-2">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-3 w-40" />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
