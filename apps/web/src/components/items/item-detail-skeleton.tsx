import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function ItemDetailSkeleton() {
  return (
    <div className="flex flex-col">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 flex-1">
        {/* Left column - Item details */}
        <Card className="lg:col-span-2 h-[800px] overflow-auto">
          <CardHeader>
            <CardTitle>Item</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Image and title */}
            <div className="flex flex-col md:flex-row gap-6">
              <Skeleton className="w-32 h-32 rounded-lg flex-shrink-0" />
              <div className="flex-1 h-full space-y-2">
                <div className="flex flex-col gap-y-2">
                  <Skeleton className="h-6 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Skeleton className="h-5 w-20 rounded-full" />
                  <Skeleton className="h-5 w-16 rounded-full" />
                  <Skeleton className="h-5 w-24 rounded-full" />
                </div>
              </div>
            </div>

            {/* Releases */}
            <div>
              <Skeleton className="h-4 w-20 mb-3" />
              <div className="space-y-2">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="flex flex-wrap items-center gap-2 p-3 border rounded-lg">
                    <Skeleton className="h-4 w-4" />
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-5 w-16 rounded-full" />
                    <Skeleton className="h-5 w-28 rounded-full" />
                    <Skeleton className="h-4 w-20 ml-auto" />
                  </div>
                ))}
              </div>
            </div>

            {/* Entries */}
            <div>
              <Skeleton className="h-4 w-32 mb-3" />
              <div className="space-y-3">
                {[...Array(4)].map((_, i) => (
                  <div key={i}>
                    <Skeleton className="h-3 w-24 mb-2" />
                    <div className="flex flex-wrap gap-2">
                      {[...Array(3)].map((_, j) => (
                        <Skeleton key={j} className="h-5 w-20 rounded-full" />
                      ))}
                    </div>
                  </div>
                ))}
                {/* Dimensions */}
                <div>
                  <Skeleton className="h-3 w-24 mb-2" />
                  <div className="flex flex-wrap gap-2">
                    {[...Array(4)].map((_, i) => (
                      <Skeleton key={i} className="h-5 w-28 rounded-full" />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Right column - Personal collection */}
        <Card className="flex flex-col h-[800px]">
          <CardHeader className="flex-shrink-0">
            <CardTitle>Personal</CardTitle>
          </CardHeader>
          <CardContent className="flex-1 px-4 overflow-y-auto">
            <div className="space-y-4">
              {[...Array(2)].map((_, i) => (
                <Card key={i}>
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <Skeleton className="h-5 w-20 rounded-full" />
                      <div className="ml-auto flex gap-2">
                        <Skeleton className="h-9 w-9" />
                        <Skeleton className="h-9 w-9" />
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {[...Array(8)].map((_, j) => (
                        <div key={j} className="flex justify-between items-center">
                          <Skeleton className="h-4 w-24" />
                          <Skeleton className="h-4 w-20" />
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
