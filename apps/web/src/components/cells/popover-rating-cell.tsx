import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Rating } from "../ui/rating";
import { useState } from "react";
import { usePendingValue } from "@/hooks/use-pending-value";

interface PopoverRatingCellProps {
  value: string;
  onSubmit: (newValue: string) => Promise<void>;
  disabled?: boolean;
}

export function PopoverRatingCell({ value, onSubmit, disabled = false }: PopoverRatingCellProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [displayValue, submit] = usePendingValue(value, onSubmit);

  const handleSubmit = async (newValue: string) => {
    if (Number(newValue) === Number(displayValue)) return;
    await submit(newValue);
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            className="w-full justify-start text-foreground pl-0"
            disabled={disabled}
          >
            {displayValue}
          </Button>
        }
      />
      {isOpen && (
        <PopoverContent>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="score">Score</Label>
              <div>
                <Rating
                  size="md"
                  rating={Number(displayValue) || 0}
                  onRatingChange={(nextRating) => handleSubmit(nextRating.toFixed(1))}
                  editable={true}
                  showValue={true}
                  maxRating={10}
                />
              </div>
            </div>
          </div>
        </PopoverContent>
      )}
    </Popover>
  );
}
