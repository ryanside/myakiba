import { useId } from "react";
import type { ReactNode } from "react";

// Rows carry their own 16px inset, so the list is pulled out by the same amount and its text
// starts on the group title's edge. Rows are parted by their padding, not by rules or cards.
const ROWS_CLASS_NAME = "-mx-4 flex flex-col";

type SettingsGroupProps = {
  readonly children: ReactNode;
  readonly title?: string;
  /** `rows` sets children as rows. `cards` sets children as they are, such as the theme picker. */
  readonly variant?: "rows" | "cards";
};

export function SettingsGroup({ children, title, variant = "rows" }: SettingsGroupProps) {
  const titleId = useId();

  if (!title) {
    return <div className={ROWS_CLASS_NAME}>{children}</div>;
  }

  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-2">
      <h3
        id={titleId}
        className="eyebrow flex h-6 items-center text-[0.6875rem] tracking-tight text-muted-foreground/70"
      >
        {title}
      </h3>
      {variant === "cards" ? children : <div className={ROWS_CLASS_NAME}>{children}</div>}
    </section>
  );
}

export function SettingsGroupFooter({ children }: { readonly children: ReactNode }) {
  return <footer className="flex items-center justify-end gap-3 px-4 py-3">{children}</footer>;
}
