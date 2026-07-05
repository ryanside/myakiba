import { useEffect, useMemo, useRef, useState } from "react";
import type { ComponentProps } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { HugeiconsIcon } from "@hugeicons/react";
import type { IconSvgElement } from "@hugeicons/react";
import { Button } from "@/components/ui/button";
import {
  CheckmarkCircle02Icon,
  Alert02Icon,
  InformationCircleIcon,
  MultiplicationSignCircleIcon,
  Diamond01Icon,
  Cancel01Icon,
} from "@hugeicons/core-free-icons";

type PixelToastVariant = "success" | "error" | "info" | "warning" | "default";

type PixelToastAction = {
  readonly label: string;
  readonly icon?: IconSvgElement;
  readonly onClick?: () => void;
  readonly to?: ComponentProps<typeof Link>["to"];
  readonly params?: Record<string, string>;
};

type PixelToastOptions = {
  readonly title: string;
  readonly description?: string;
  readonly variant?: PixelToastVariant;
  readonly action?: PixelToastAction;
  readonly duration?: number;
};

const DEFAULT_DURATION = 5000;
const PIXEL_COUNT = 44;

const VARIANT_ICON: Record<PixelToastVariant, IconSvgElement> = {
  success: CheckmarkCircle02Icon,
  error: MultiplicationSignCircleIcon,
  info: InformationCircleIcon,
  warning: Alert02Icon,
  default: Diamond01Icon,
};

const VARIANT_COLOR: Record<PixelToastVariant, string> = {
  success: "var(--success)",
  error: "var(--destructive)",
  info: "var(--info)",
  warning: "var(--warning)",
  default: "var(--info)",
};

function PixelBar({ aliveCount, color }: { readonly aliveCount: number; readonly color: string }) {
  const jitter = useMemo(
    () => Array.from({ length: PIXEL_COUNT }, () => 0.6 + Math.random() * 0.4),
    [],
  );
  const firstAlive = PIXEL_COUNT - aliveCount;

  return (
    <div className="flex h-1.5 w-full items-stretch gap-[3px]">
      {jitter.map((brightness, index) => {
        const alive = index >= firstAlive;
        return (
          <span
            key={index}
            className="flex-1 rounded-[2px] transition-[background-color,opacity] duration-300"
            style={{
              backgroundColor: alive ? color : "var(--muted-foreground)",
              opacity: alive ? brightness : 0.18,
            }}
          />
        );
      })}
    </div>
  );
}

function PixelToastActionControl({
  action,
  color,
  id,
}: {
  readonly action: PixelToastAction;
  readonly color: string;
  readonly id: string | number;
}) {
  const icon =
    action.icon !== undefined ? (
      <HugeiconsIcon icon={action.icon} strokeWidth={2} className="size-4" style={{ color }} />
    ) : null;

  if (action.to !== undefined) {
    return (
      <Button
        variant="ghost"
        size="sm"
        className="h-auto px-1 py-0 font-medium text-foreground/90 shadow-none ring-0 hover:text-foreground"
        render={<Link to={action.to} params={action.params} onClick={() => toast.dismiss(id)} />}
        nativeButton={false}
      >
        {icon}
        {action.label}
      </Button>
    );
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-auto px-1 py-0 font-medium text-foreground/90 shadow-none ring-0 hover:text-foreground"
      onClick={() => {
        action.onClick?.();
        toast.dismiss(id);
      }}
    >
      {icon}
      {action.label}
    </Button>
  );
}

function PixelToast({
  id,
  title,
  description,
  variant = "default",
  action,
  duration = DEFAULT_DURATION,
}: PixelToastOptions & { readonly id: string | number }) {
  const [aliveCount, setAliveCount] = useState(PIXEL_COUNT);
  const pausedRef = useRef(false);
  const color = VARIANT_COLOR[variant];

  useEffect(() => {
    let frame = 0;
    let last = performance.now();
    let elapsed = 0;
    let trackedAlive = PIXEL_COUNT;

    const tick = (now: number) => {
      const delta = now - last;
      last = now;
      if (!pausedRef.current) {
        elapsed += delta;
      }

      const remaining = Math.max(0, 1 - elapsed / duration);
      const nextAlive = Math.ceil(remaining * PIXEL_COUNT);

      if (nextAlive !== trackedAlive) {
        trackedAlive = nextAlive;
        setAliveCount(nextAlive);
      }

      if (nextAlive <= 0) {
        toast.dismiss(id);
        return;
      }

      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [id, duration]);

  return (
    <div
      onMouseEnter={() => {
        pausedRef.current = true;
      }}
      onMouseLeave={() => {
        pausedRef.current = false;
      }}
      className="bg-popover text-popover-foreground w-[380px] overflow-hidden rounded-2xl border border-white/10 shadow-xl shadow-black/40"
    >
      <div className="flex items-center gap-3 px-4 pt-4 pb-2.5">
        <HugeiconsIcon
          icon={VARIANT_ICON[variant]}
          strokeWidth={2}
          className="size-5 shrink-0"
          style={{ color }}
        />
        <div className="min-w-0 flex-1">
          <p className="text-[0.9rem] leading-tight font-medium">{title}</p>
          {description !== undefined ? (
            <p className="text-muted-foreground mt-0.5 truncate text-xs">{description}</p>
          ) : null}
        </div>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Dismiss"
          onClick={() => toast.dismiss(id)}
          className="text-muted-foreground hover:text-foreground"
        >
          <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
        </Button>
        {action !== undefined ? (
          <>
            <span className="bg-border h-8 w-px shrink-0" />
            <PixelToastActionControl action={action} color={color} id={id} />
          </>
        ) : null}
      </div>
      <div className="px-3 pb-3">
        <PixelBar aliveCount={aliveCount} color={color} />
      </div>
    </div>
  );
}

export function showPixelToast(options: PixelToastOptions): string | number {
  return toast.custom((id) => <PixelToast id={id} {...options} />, {
    duration: Number.POSITIVE_INFINITY,
  });
}

export type { PixelToastOptions, PixelToastVariant, PixelToastAction };
