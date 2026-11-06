import { useEffect, useId, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const LIST_HEADING_CLASS_NAME = "flex min-h-18 min-w-0 flex-1 flex-col justify-center";

export function ListHeading({
  title,
  description,
  count,
}: {
  readonly title: string;
  readonly description: string;
  readonly count: ReactNode;
}): React.JSX.Element {
  const id = useId();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const descriptionRef = useRef<HTMLParagraphElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [truncated, setTruncated] = useState(false);

  useEffect(() => {
    if (expanded) return;
    const lines = [titleRef.current, descriptionRef.current].filter((line) => line !== null);
    const measure = (): void => {
      setTruncated(lines.some((line) => line.scrollWidth > line.clientWidth));
    };
    const measureAfterFonts = async (): Promise<void> => {
      // Inter swaps in after first paint and changes how much of a line fits.
      await document.fonts.ready;
      measure();
    };
    const observer = new ResizeObserver(measure);
    for (const line of lines) observer.observe(line);
    void measureAfterFonts();
    return () => observer.disconnect();
  }, [expanded]);

  const toggle =
    truncated || expanded || /\n/.test(description) ? (
      <Button
        variant="secondary"
        size="xs"
        aria-expanded={expanded}
        aria-controls={id}
        onClick={() => setExpanded((current) => !current)}
        className="-my-0.5 ms-0.5 self-center align-top"
      >
        {expanded ? "Less" : "More"}
      </Button>
    ) : null;

  return (
    <div id={id} className={cn(LIST_HEADING_CLASS_NAME, "animate-data-in")}>
      <h1
        ref={titleRef}
        className={cn("page-title", expanded ? "text-pretty [overflow-wrap:anywhere]" : "truncate")}
      >
        {title}
      </h1>
      {description ? (
        <div
          className={cn(
            "max-w-2xl text-sm leading-5 text-muted-foreground",
            !expanded && "flex items-baseline gap-1",
          )}
        >
          <p
            ref={descriptionRef}
            className={
              expanded
                ? "inline text-pretty whitespace-pre-wrap [overflow-wrap:anywhere]"
                : "min-w-0 truncate"
            }
          >
            {description}
          </p>
          {expanded ? " " : null}
          {toggle}
        </div>
      ) : null}
      <p className="flex min-h-5 items-baseline gap-1 text-sm leading-5 text-muted-foreground tabular-nums">
        {count}
        {description ? null : toggle}
      </p>
    </div>
  );
}
