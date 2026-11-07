import { useId } from "react";
import type { ReactNode } from "react";

const ROWS_CLASS_NAME = "-mx-4 flex flex-col";

type SettingsGroupProps = {
  readonly children: ReactNode;
  readonly title?: string;
  readonly variant?: "rows" | "cards";
};

export function SettingsGroup({ children, title, variant = "rows" }: SettingsGroupProps) {
  const titleId = useId();

  if (!title) {
    return <div className={ROWS_CLASS_NAME}>{children}</div>;
  }

  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-2">
      <h3 id={titleId} className="group-label flex h-6 items-center">
        {title}
      </h3>
      {variant === "cards" ? children : <div className={ROWS_CLASS_NAME}>{children}</div>}
    </section>
  );
}

export function SettingsGroupFooter({ children }: { readonly children: ReactNode }) {
  return <footer className="flex items-center justify-end gap-3 px-4 py-3">{children}</footer>;
}
