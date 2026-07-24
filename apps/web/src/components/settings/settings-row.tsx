import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type SettingsGroupProps = {
  readonly title?: string;
  readonly children: ReactNode;
  readonly className?: string;
};

export function SettingsGroup({ title, children, className }: SettingsGroupProps) {
  return (
    <div className="space-y-2">
      {title ? <p className="text-sm font-medium text-muted-foreground">{title}</p> : null}
      <div className={cn("divide-y divide-border overflow-hidden rounded-lg border", className)}>
        {children}
      </div>
    </div>
  );
}

type SettingsRowProps = {
  readonly label: string;
  readonly description?: string;
  readonly control: ReactNode;
  readonly stackOnMobile?: boolean;
};

export function SettingsRow({
  label,
  description,
  control,
  stackOnMobile = true,
}: SettingsRowProps) {
  return (
    <div
      className={cn(
        "flex gap-4 p-4",
        stackOnMobile
          ? "flex-col sm:flex-row sm:items-center sm:justify-between"
          : "flex-row items-center justify-between",
      )}
    >
      <div className="min-w-0 space-y-1">
        <p className="text-sm font-medium">{label}</p>
        {description ? (
          <p className="text-pretty text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      <div className={cn(stackOnMobile ? "sm:shrink-0" : "shrink-0")}>{control}</div>
    </div>
  );
}

type SettingsFormStackProps = {
  readonly title?: string;
  readonly description?: string;
  readonly children: ReactNode;
  readonly footer?: ReactNode;
  readonly className?: string;
};

export function SettingsFormStack({
  title,
  description,
  children,
  footer,
  className,
}: SettingsFormStackProps) {
  return (
    <div className={cn("space-y-4 rounded-lg border p-4", className)}>
      {title || description ? (
        <div className="space-y-1">
          {title ? <p className="text-sm font-medium">{title}</p> : null}
          {description ? (
            <p className="text-pretty text-sm text-muted-foreground">{description}</p>
          ) : null}
        </div>
      ) : null}
      <div className="space-y-4">{children}</div>
      {footer ? <div>{footer}</div> : null}
    </div>
  );
}
