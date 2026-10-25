import { useId } from "react";
import type { ReactNode } from "react";
import { FrameHeader, FramePanel, frameVariants } from "@/components/reui/frame";
import { cn } from "@/lib/utils";

const ROWS_CLASS_NAME = "divide-y divide-border/70";

type SettingsGroupProps = {
  readonly children: ReactNode;
  readonly title?: string;
  /**
   * `rows` sets children on one panel with dividers. `cards` lets children be their own
   * panels, such as an untitled group.
   */
  readonly variant?: "rows" | "cards";
};

export function SettingsGroup({ children, title, variant = "rows" }: SettingsGroupProps) {
  const titleId = useId();

  if (!title) {
    return (
      <div
        className={cn(
          ROWS_CLASS_NAME,
          "overflow-hidden rounded-[calc(var(--frame-radius)-5px)] bg-card text-card-foreground",
        )}
      >
        {children}
      </div>
    );
  }

  return (
    <section
      aria-labelledby={titleId}
      data-slot="frame"
      data-spacing="sm"
      className={cn(
        frameVariants({ spacing: "sm" }),
        "border-none shadow-xs! ring-1 ring-foreground/10",
      )}
    >
      <FrameHeader className="flex-row items-center justify-between gap-3 py-1.5">
        <h3 id={titleId} className="text-[13px] font-medium text-muted-foreground">
          {title}
        </h3>
      </FrameHeader>
      {variant === "cards" ? (
        <div className="m-0.5 mt-0">{children}</div>
      ) : (
        <FramePanel
          className={cn(
            ROWS_CLASS_NAME,
            "m-0.5 mt-0 rounded-[calc(var(--frame-radius)-5px)] border-none p-0 shadow-none! before:hidden",
          )}
        >
          {children}
        </FramePanel>
      )}
    </section>
  );
}

export function SettingsGroupFooter({ children }: { readonly children: ReactNode }) {
  return <footer className="flex justify-end px-4 py-3">{children}</footer>;
}
