import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function CollectionSkeleton() {
  return (
    <div className="w-full space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-2">
        <div className="flex flex-row items-start gap-4">
          <Skeleton className="h-8 w-36" />
        </div>
        <Skeleton className="h-4 w-64" />
      </div>
      {/* KPIs */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
      {/* Filter bar */}
      <div className="flex flex-row items-center gap-2">
        <Skeleton className="h-8 w-84" />
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-8 w-24" />
      </div>
      <Card className="p-0 gap-0">
        {/* Table */}
        <CardContent className="p-1">
          <div className="">
            {/* Table header */}
            <div className="flex items-center gap-6 p-4 border-b">
              <Skeleton className="h-4 w-8" />
              <Skeleton className="h-4 w-24" />
              <div className="flex ml-auto flex-row gap-4">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-20" />
              </div>
            </div>

            {/* Table rows */}
            {[...Array(7)].map((_, i) => (
              <div
                key={i}
                className="flex items-center gap-4 p-4 hover:bg-muted/50"
              >
                <Skeleton className="h-5 w-5 rounded-xs mr-6" />
                <Skeleton className="h-10 w-10 rounded-md" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-5/7" />
                  <Skeleton className="h-3 w-1/7" />
                </div>
                <div className="flex ml-auto flex-row gap-4">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-20" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
      <div className="flex items-center justify-center">
        <div className="flex flex-row items-center mr-auto gap-2">
          <Skeleton className="h-4 w-32" />
        </div>
        <div className="flex flex-row items-center gap-2">
          <Skeleton className="size-8" />
          <Skeleton className="size-8" />
          <Skeleton className="size-8" />
        </div>
        <div className="flex flex-row items-center ml-auto gap-2">
          <Skeleton className="size-8" />
          <Skeleton className="size-8" />
          <Skeleton className="size-8" />
        </div>
      </div>
    </div>
  );
}
