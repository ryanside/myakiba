import type { ComponentType, ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useDemoTheme } from "@/components/demos/demo-props";
import type { DemoProps } from "@/components/demos/demo-props";
import { GITHUB_URL } from "@/components/homepage/links";
import { GitHubLogo } from "@/components/ui/brand-icons";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type HomeDemo = {
  readonly Demo: ComponentType<DemoProps>;
  readonly title: string;
  readonly caption?: string;
};

export const CONTAINER = "mx-auto max-w-7xl px-6";

export const CARD = "rounded-xl bg-background shadow-sm ring-1 ring-foreground/6.5";

export const CELL_CARD = cn(CARD, "flex min-w-0 flex-col overflow-hidden shadow-black/6.5");

export function HomeSection({
  id,
  labelledBy,
  className,
  children,
}: {
  readonly id?: string;
  readonly labelledBy: string;
  readonly className: string;
  readonly children: ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={labelledBy}
      className={cn(id !== undefined && "scroll-mt-8", className)}
    >
      <div className={CONTAINER}>{children}</div>
    </section>
  );
}

export function Bezel({
  className,
  children,
}: {
  readonly className: string;
  readonly children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "relative rounded-[1.55rem] bg-background p-2 ring ring-foreground/6.5 before:pointer-events-none before:absolute before:-inset-px before:z-10 before:size-56 before:rounded-tl-[1.55rem] before:border-t before:border-l before:border-foreground/10 before:mask-radial-[100%_60%] before:mask-radial-from-65% before:mask-radial-at-top-left",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function DemoLead({ demo }: { readonly demo: HomeDemo }) {
  return (
    <>
      <span className="text-foreground">{demo.title}.</span>
      {demo.caption ? ` ${demo.caption}` : null}
    </>
  );
}

export function DemoStage({
  demo: { Demo },
  layout,
}: {
  readonly demo: HomeDemo;
  readonly layout: "compact" | "wide";
}) {
  const theme = useDemoTheme();
  return layout === "compact" ? (
    <div data-ss-fill className="mx-auto w-full max-w-[26rem]">
      <Demo theme={theme} />
    </div>
  ) : (
    <div className="mx-auto w-full max-w-[60rem]">
      <Demo theme={theme} />
    </div>
  );
}

export function StartActions({ className }: { readonly className?: string }) {
  return (
    <div className={cn("flex shrink-0 items-center gap-2", className)}>
      <Button size="lg" render={<Link to="/signup" />} nativeButton={false}>
        Get started
      </Button>
      <Button
        variant="ghost"
        size="lg"
        render={
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="View on GitHub"
          />
        }
        nativeButton={false}
        className="lg:-mr-4"
      >
        <GitHubLogo data-icon="inline-start" className="size-4" />
        View on GitHub
      </Button>
    </div>
  );
}
