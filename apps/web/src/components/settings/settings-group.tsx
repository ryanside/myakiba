import type { ReactNode } from "react";

type SettingsGroupProps = {
  readonly children: ReactNode;
  readonly title?: string;
};

type SettingsGroupFooterProps = {
  readonly children: ReactNode;
};

export function SettingsGroup({ children, title }: SettingsGroupProps) {
  return (
    <div className="flex flex-col gap-2">
      {title ? <h2 className="text-[13px] font-medium text-muted-foreground">{title}</h2> : null}
      <div className="divide-y divide-border/80 overflow-hidden rounded-xl bg-card text-card-foreground shadow-xs ring-1 ring-foreground/10">
        {children}
      </div>
    </div>
  );
}

export function SettingsGroupFooter({ children }: SettingsGroupFooterProps) {
  return <footer className="flex justify-end px-4 py-3">{children}</footer>;
}
