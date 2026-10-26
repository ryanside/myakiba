import type { ReactNode } from "react";

export function PageHeader({
  title,
  titleAccessory,
  meta,
  actions,
}: {
  readonly title: ReactNode;
  readonly titleAccessory?: ReactNode;
  readonly meta?: ReactNode;
  readonly actions?: ReactNode;
}): React.JSX.Element {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <h1 className="min-w-0 font-heading text-2xl font-medium tracking-tight break-words">
            {title}
          </h1>
          {titleAccessory}
        </div>
        {meta === undefined ? null : (
          <p className="mt-0.5 min-h-5 text-sm text-muted-foreground tabular-nums">{meta}</p>
        )}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function formatCount(count: number, singular: string, plural: string): string {
  return `${count.toLocaleString()} ${count === 1 ? singular : plural}`;
}
