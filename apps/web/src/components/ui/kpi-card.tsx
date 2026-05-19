import { Frame, FrameHeader, FramePanel, FrameTitle } from "@/components/reui/frame";
import { Skeleton } from "@/components/ui/skeleton";

interface KPICardProps {
  readonly title: string;
  readonly subtitle?: string;
  readonly value: string | number | undefined;
  readonly subvalueTitle?: string;
  readonly subvalue?: string | number | undefined;
  readonly isLoading?: boolean;
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
    <Frame className="border-none ring-1 ring-foreground/10 shadow-xs!" spacing="sm">
      <FrameHeader>
        <FrameTitle className="text-xs lowercase font-orbitron font-medium">{title}</FrameTitle>
      </FrameHeader>
      <FramePanel className="shadow-none! border-none flex m-0.5 mt-0 flex-col justify-end gap-1 before:rounded-(--frame-radius)">
        {isLoading ? (
          <Skeleton className="h-8 w-24" />
        ) : (
          <div className="flex items-baseline gap-2">
            <p className="animate-data-in text-2xl font-medium tracking-tight text-foreground">
              {value}
            </p>
            {subvalueTitle && subvalue !== undefined && (
              <div className="animate-data-in flex items-baseline gap-1 [--data-in-delay:60ms]">
                <span className="text-xs text-muted-foreground tabular-nums">{subvalue}</span>
                <span className="text-xs text-muted-foreground">{subvalueTitle}</span>
              </div>
            )}
          </div>
        )}
        {subtitle && <p className="italic text-xs text-muted-foreground">{subtitle}</p>}
      </FramePanel>
    </Frame>
  );
}
