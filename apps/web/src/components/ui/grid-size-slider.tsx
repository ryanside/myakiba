import { Slider } from "@/components/ui/slider";
import { HugeiconsIcon } from "@hugeicons/react";
import { GridViewIcon } from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";

interface GridSizeSliderProps {
  readonly value: number;
  readonly onValueChange: (value: number) => void;
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  readonly className?: string;
}

export function GridSizeSlider({
  value,
  onValueChange,
  min = 140,
  max = 320,
  step = 10,
  className,
}: GridSizeSliderProps): React.JSX.Element {
  return (
    <div className={cn("flex w-full max-w-48 items-center justify-center gap-1.5", className)}>
      <HugeiconsIcon icon={GridViewIcon} className="size-3 shrink-0 text-muted-foreground" />
      <Slider
        value={value}
        onValueChange={(val) => {
          onValueChange(Array.isArray(val) ? val[0] : val);
        }}
        min={min}
        max={max}
        step={step}
      />
      <HugeiconsIcon icon={GridViewIcon} className="size-4 shrink-0 text-muted-foreground" />
    </div>
  );
}
