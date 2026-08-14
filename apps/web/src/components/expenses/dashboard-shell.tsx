import type { ReactNode } from "react";
import { Frame, FrameHeader, FramePanel, FrameTitle } from "@/components/reui/frame";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export interface ChartOption<TValue extends string> {
  readonly label: string;
  readonly value: TValue;
}

interface ChartLegendItem<TKey extends string> {
  readonly color: string;
  readonly key: TKey;
  readonly label: string;
}

export function ExpensePanel({
  title,
  children,
  className,
  panelClassName,
  headerAction,
}: {
  readonly title: string;
  readonly children: ReactNode;
  readonly className?: string;
  readonly panelClassName?: string;
  readonly headerAction?: ReactNode;
}): ReactNode {
  return (
    <Frame
      spacing="sm"
      className={cn("border-none shadow-xs! ring-1 ring-foreground/10", className)}
    >
      <FrameHeader
        className={cn(
          "gap-2 sm:flex-row sm:items-center sm:justify-between",
          headerAction && "py-1",
        )}
      >
        <FrameTitle className="text-base">{title}</FrameTitle>
        {headerAction}
      </FrameHeader>
      <FramePanel className={cn("m-1 mt-0 border-none shadow-none!", panelClassName)}>
        {children}
      </FramePanel>
    </Frame>
  );
}

export function KpiStrip({
  items,
  isLoading,
}: {
  readonly items: readonly {
    readonly title: string;
    readonly value: ReactNode;
  }[];
  readonly isLoading: boolean;
}): ReactNode {
  return (
    <Frame
      spacing="sm"
      className="border-none shadow-xs! ring-1 ring-foreground/10"
      aria-busy={isLoading}
    >
      <FramePanel className="m-1 flex flex-col divide-y divide-border border-none p-0 shadow-none! sm:flex-row sm:divide-x sm:divide-y-0">
        {items.map((item) => (
          <div key={item.title} className="min-w-0 flex-1 px-4 py-4 sm:px-6">
            <p className="text-xs text-muted-foreground">{item.title}</p>
            {isLoading ? (
              <Skeleton className="mt-2 h-7 w-20" />
            ) : (
              <p className="animate-data-in mt-1 text-2xl font-medium tabular-nums">{item.value}</p>
            )}
          </div>
        ))}
      </FramePanel>
    </Frame>
  );
}

export function ChartSelector<TValue extends string>({
  value,
  options,
  onValueChange,
}: {
  readonly value: TValue;
  readonly options: readonly ChartOption<TValue>[];
  readonly onValueChange: (value: TValue) => void;
}): ReactNode {
  return (
    <Select
      value={value}
      onValueChange={(nextValue) => {
        if (nextValue !== null) onValueChange(nextValue);
      }}
    >
      <SelectTrigger className="w-full sm:w-56" aria-label="Select chart">
        <SelectValue>{options.find((option) => option.value === value)?.label}</SelectValue>
      </SelectTrigger>
      <SelectContent align="end">
        <SelectGroup>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}

export function ChartSeriesLegend<TKey extends string>({
  items,
  visibleKeys,
  onToggle,
}: {
  readonly items: readonly ChartLegendItem<TKey>[];
  readonly visibleKeys?: ReadonlySet<TKey>;
  readonly onToggle?: (key: TKey) => void;
}): ReactNode {
  return (
    <div className="flex flex-wrap items-center gap-1" aria-label="Chart series">
      {items.map((item, index) => {
        const visible = visibleKeys?.has(item.key) ?? true;
        const content = (
          <>
            <span
              aria-hidden
              className="size-1.5 rounded-full"
              style={{ backgroundColor: item.color }}
            />
            {item.label}
          </>
        );
        const className = cn(
          "animate-data-in text-xs font-medium",
          visible ? "text-foreground" : "text-muted-foreground opacity-45",
        );

        return onToggle ? (
          <Button
            key={item.key}
            type="button"
            variant="ghost"
            size="xs"
            aria-pressed={visible}
            onClick={() => onToggle(item.key)}
            className={className}
            style={{ animationDelay: `${60 + index * 30}ms` }}
          >
            {content}
          </Button>
        ) : (
          <span
            key={item.key}
            className={cn("flex h-6 items-center gap-1 px-2", className)}
            style={{ animationDelay: `${60 + index * 30}ms` }}
          >
            {content}
          </span>
        );
      })}
    </div>
  );
}

export function ChartSection({
  title,
  selector,
  legend,
  children,
  isEmpty,
  emptyMessage,
}: {
  readonly title: string;
  readonly selector: ReactNode;
  readonly legend: ReactNode;
  readonly children: ReactNode;
  readonly isEmpty: boolean;
  readonly emptyMessage: string;
}): ReactNode {
  return (
    <Frame spacing="sm" className="h-[400px] border-none shadow-xs! ring-1 ring-foreground/10">
      <FrameHeader className="gap-2 py-1 sm:flex-row sm:items-center sm:justify-between">
        <FrameTitle className="text-base">{title}</FrameTitle>
        {selector}
      </FrameHeader>
      <FramePanel className="m-1 mt-0 flex min-h-0 flex-1 flex-col gap-1 border-none shadow-none!">
        {isEmpty ? (
          <p className="m-auto text-sm text-muted-foreground">{emptyMessage}</p>
        ) : (
          <>
            <div className="flex min-h-6 shrink-0 justify-end">{legend}</div>
            <div className="min-h-0 w-full flex-1">{children}</div>
          </>
        )}
      </FramePanel>
    </Frame>
  );
}
