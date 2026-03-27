import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface KPICardProps {
  title: string;
  subtitle?: string;
  value: string | number | undefined;
  subvalueTitle?: string;
  subvalue?: string | number | undefined;
  isLoading?: boolean;
}

export function KPICard({
  title,
  subtitle,
  value,
  subvalueTitle,
  subvalue,
  isLoading,
}: KPICardProps): React.ReactNode {
  return (
    <Card className="flex-1 flex flex-col">
      <CardHeader className="flex flex-col items-start">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        {subtitle && (
          <CardDescription className="text-xs text-muted-foreground">{subtitle}</CardDescription>
        )}
      </CardHeader>
      <CardContent className="mt-auto">
        <div className="flex flex-row items-baseline w-full">
          {isLoading ? (
            <Skeleton className="h-7 w-24" />
          ) : (
            <p className="text-xl font-medium">{value}</p>
          )}
          {!isLoading && subvalueTitle && subvalue !== undefined && (
            <div className="flex-row gap-1 ml-2 flex">
              <p className="text-xs text-muted-foreground font-normal">{subvalue}</p>
              <p className="text-xs text-muted-foreground font-normal">{subvalueTitle}</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
