import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface KPICardProps {
  title: string;
  subtitle?: string;
  value: string | number | undefined;
  subvalueTitle?: string;
  subvalue?: string | number | undefined;
}

export function KPICard({
  title,
  subtitle,
  value,
  subvalueTitle,
  subvalue,
}: KPICardProps): React.ReactNode {
  return (
    <Card className="flex-1 flex flex-col ">
      <CardHeader className="flex flex-col items-start gap-2">
        <CardTitle className="text-md font-medium">{title}</CardTitle>
        {subtitle && <CardDescription className="text-xs text-muted-foreground">
          {subtitle}
        </CardDescription>}
      </CardHeader>
      <CardContent className="mt-auto">
        <div className="flex flex-row items-baseline w-full">
          {value == null ? (
            <Skeleton className="h-8 w-24" />
          ) : (
            <p className="text-2xl font-mono">{value}</p>
          )}
          {value != null && subvalueTitle && (subvalue !== undefined) && (
            <div className="flex-row gap-1 ml-2 flex">
              <p className="text-xs text-muted-foreground  font-light">
                {subvalue}
              </p>
              <p className="text-xs text-muted-foreground font-light">
                {subvalueTitle}
              </p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

