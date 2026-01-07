import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function DashboardSkeleton() {
  return (
    <div className="">
      {/* Header section with welcome message and action buttons */}
      <div className="flex flex-col lg:flex-row items-start mb-6 gap-4">
        <div className="flex flex-col gap-1">
          <Skeleton className="h-8 w-64" />
        </div>
        <div className="flex flex-row flex-wrap items-center gap-2 lg:ml-auto">
          <Skeleton className="h-8.5 w-42" />
          <Skeleton className="h-8.5 w-28" />
          <Skeleton className="h-8.5 w-30" />
        </div>
      </div>

      <div className="grid gap-4 grid-cols-1 lg:grid-cols-4">
      {/* Left section - 3 columns */}
      <div className="col-span-1 lg:col-span-3 space-y-4 flex flex-col">
        {/* Inner grid with 3 main cards */}
        <div className="grid gap-4 grid-cols-1 lg:grid-cols-3">
          <div className="col-span-1 lg:col-span-3 grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Collection Breakdown card */}
            <Card className="flex flex-col h-full">
              <CardHeader className="flex flex-row items-center gap-2">
                <Skeleton className="h-4 w-40" />
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Horizontal Stacked Bar */}
                <div className="relative">
                  <Skeleton className="h-4 w-full rounded-xs" />
                </div>

                {/* Total Items Section */}
                <div className="flex flex-col gap-2 pt-4 border-t">
                  <div className="flex justify-between items-center">
                    <Skeleton className="h-6 w-24" />
                    <Skeleton className="h-6 w-16" />
                  </div>
                </div>

                {/* Legend */}
                <div className="flex flex-col">
                  {[...Array(4)].map((_, i) => (
                    <div
                      key={i}
                      className="flex flex-row gap-2 items-center py-1"
                    >
                      <Skeleton className="w-1 h-4 rounded-2xl" />
                      <Skeleton className="h-3 w-20" />
                      <Skeleton className="h-3 w-8" />
                      <Skeleton className="h-3 w-12" />
                      <Skeleton className="h-3 w-16 ml-auto" />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* ValueLineBarChart card */}
            <Card>
              <CardHeader>
                <Skeleton className="h-8 w-12" />
                <Skeleton className="h-4 w-32" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-48 w-full" />
              </CardContent>
            </Card>

            {/* KPI Cards column */}
            <div className="flex flex-col gap-4 col-span-1 h-full">
              {/* Total Spent KPI */}
              <Card className="flex-1 flex flex-col">
                <CardHeader className="flex flex-col items-start gap-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-3 w-32" />
                </CardHeader>
                <CardContent className="mt-auto">
                  <div className="flex flex-row items-baseline gap-2">
                    <Skeleton className="h-8 w-24" />
                    <Skeleton className="h-3 w-16" />
                    <Skeleton className="h-3 w-16" />
                  </div>
                </CardContent>
              </Card>

              {/* Active Orders KPI */}
              <Card className="flex-1 flex flex-col">
                <CardHeader className="flex flex-col items-start gap-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-3 w-32" />
                </CardHeader>
                <CardContent className="mt-auto">
                  <div className="flex flex-row items-baseline gap-2">
                    <Skeleton className="h-8 w-16" />
                    <Skeleton className="h-3 w-12" />
                    <Skeleton className="h-3 w-12" />
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>

        {/* Orders Board card - Kanban */}
        <Card className="col-span-1 lg:col-span-3 h-full">
          <CardHeader className="flex flex-row items-center gap-2">
            <div className="flex flex-col items-start gap-2">
              <Skeleton className="h-6 w-24" />
              <Skeleton className="h-4 w-40" />
            </div>
            <Skeleton className="h-8 w-20 ml-auto" />
          </CardHeader>
          <CardContent className="h-full">
            {/* Kanban columns */}
            <div className="grid auto-rows-fr grid-cols-3 gap-4 h-full">
              {[...Array(3)].map((_, colIdx) => (
                <div
                  key={colIdx}
                  className="rounded-lg border bg-background p-4 shadow-xs"
                >
                  {/* Column Header */}
                  <div className="flex items-center justify-between mb-2.5">
                    <div className="flex items-center gap-2.5">
                      <Skeleton className="h-6 w-16" />
                      <Skeleton className="h-6 w-6" />
                    </div>
                  </div>
                  {/* Order Cards */}
                  <div className="flex flex-col gap-4 p-0.5">
                    {[...Array(2)].map((_, cardIdx) => (
                      <div
                        key={cardIdx}
                        className="rounded-md border bg-card p-3 shadow-xs"
                      >
                        {/* Item Images */}
                        <div className="flex gap-1 mb-2">
                          {[...Array(3)].map((_, imgIdx) => (
                            <Skeleton
                              key={imgIdx}
                              className="w-12 h-12 rounded-md"
                            />
                          ))}
                        </div>
                        {/* Title and Shop */}
                        <div className="flex flex-col gap-2 mb-2">
                          <Skeleton className="h-3 w-3/4" />
                          <Skeleton className="h-4 w-16" />
                        </div>
                        {/* Bottom Info */}
                        <div className="flex items-center justify-between pt-1 border-t">
                          <Skeleton className="h-3 w-16" />
                          <Skeleton className="h-4 w-12" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Right sidebar - 1 column */}
      <div className="col-span-1 space-y-4 flex flex-col">
        {/* Budget Control card */}
        <Card>
          <CardHeader className="flex flex-row items-center gap-4 mb-4">
            <Skeleton className="h-4 w-32" />
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-2 w-full" />
            </div>
            <div className="flex justify-between items-center">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-3 w-20" />
            </div>
          </CardContent>
        </Card>

        {/* Release Calendar card */}
        <Card className="min-h-[210px]">
          <CardHeader className="flex flex-row items-center gap-2">
            <Skeleton className="h-4 w-32" />
          </CardHeader>
          <CardContent>
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

        {/* Unpaid Orders card */}
        <Card className="flex-1">
          <CardHeader className="flex flex-row items-center gap-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-5 w-8" />
            <Skeleton className="h-5 w-16" />
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="flex items-center gap-3 p-2 rounded-md">
                  <Skeleton className="h-12 w-12 rounded-md flex-shrink-0" />
                  <div className="flex-1 min-w-0 space-y-2">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-3 w-20" />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
      </div>
    </div>
  );
}
