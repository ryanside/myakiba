import type { ReactNode } from "react";

/**
 * A page title with its grey count on the same line, after recent.design:
 * "Lists  4 Lists". Actions sit at the far end of the row.
 */
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
    <div className="flex min-h-9 flex-wrap items-center justify-between gap-x-4 gap-y-3">
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
        <div className="flex items-center gap-1.5">
          <h1 className="min-w-0 page-title break-words">{title}</h1>
          {titleAccessory}
        </div>
        {meta === undefined ? null : (
          <p className="min-h-6 text-[1.0625rem] leading-6 text-muted-foreground tabular-nums">
            {meta}
          </p>
        )}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function formatCount(count: number, singular: string, plural: string): string {
  return `${count.toLocaleString()} ${count === 1 ? singular : plural}`;
}
