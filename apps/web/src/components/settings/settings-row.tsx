import type { ReactNode } from "react";

type SettingsRowProps = {
  readonly title: string;
  readonly description?: string;
  readonly htmlFor?: string;
  readonly children: ReactNode;
};

export function SettingsRow({ title, description, htmlFor, children }: SettingsRowProps) {
  return (
    <div className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-8">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        {htmlFor ? (
          <label className="text-sm font-medium leading-snug" htmlFor={htmlFor}>
            {title}
          </label>
        ) : (
          <div className="text-sm font-medium leading-snug">{title}</div>
        )}
        {description && description.length > 0 ? (
          <p className="text-pretty text-[13px] leading-snug text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      <div className="flex w-full shrink-0 flex-col items-stretch gap-2 sm:w-auto sm:max-w-lg sm:items-end">
        {children}
      </div>
    </div>
  );
}
