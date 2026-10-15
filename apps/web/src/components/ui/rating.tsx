"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { StarIcon } from "@hugeicons/core-free-icons";
import * as React from "react";
import { cn } from "@/lib/utils";
import { cva } from "class-variance-authority";
import type { VariantProps } from "class-variance-authority";

const ratingVariants = cva("flex items-center", {
  variants: {
    size: {
      sm: "gap-2",
      md: "gap-2.5",
      lg: "gap-3",
    },
  },
  defaultVariants: {
    size: "md",
  },
});

const starVariants = cva("", {
  variants: {
    size: {
      sm: "w-4 h-4",
      md: "w-5 h-5",
      lg: "w-6 h-6",
    },
  },
  defaultVariants: {
    size: "md",
  },
});

const valueVariants = cva("text-muted-foreground w-5", {
  variants: {
    size: {
      sm: "text-xs",
      md: "text-sm",
      lg: "text-base",
    },
  },
  defaultVariants: {
    size: "md",
  },
});

function Rating({
  rating,
  maxRating = 5,
  size,
  className,
  starClassName,
  showValue = false,
  editable = false,
  onRatingChange,
  "aria-describedby": ariaDescribedBy,
  ...props
}: React.ComponentProps<"div"> &
  VariantProps<typeof ratingVariants> & {
    /**
     * Current rating value (supports decimal values for partial stars)
     */
    rating: number;
    maxRating?: number;
    showValue?: boolean;
    /**
     * Class name for the value span
     */
    starClassName?: string;
    editable?: boolean;
    onRatingChange?: (rating: number) => void;
  }) {
  const [hoveredRating, setHoveredRating] = React.useState<number | null>(null);
  const displayRating = editable && hoveredRating !== null ? hoveredRating : rating;
  const valueId = React.useId();

  const renderStars = () => {
    const stars = [];

    for (let i = 1; i <= maxRating; i++) {
      const filled = displayRating >= i;
      const partiallyFilled = displayRating > i - 1 && displayRating < i;
      const fillPercentage = partiallyFilled ? (displayRating - (i - 1)) * 100 : 0;

      const star = (
        <>
          <HugeiconsIcon
            icon={StarIcon}
            data-slot="rating-star-empty"
            className={cn(starVariants({ size }), "text-muted-foreground/30")}
          />

          <span
            className="absolute inset-0 overflow-hidden"
            style={{
              width: filled ? "100%" : `${fillPercentage}%`,
            }}
          >
            <HugeiconsIcon
              icon={StarIcon}
              data-slot="rating-star-filled"
              className={cn(starVariants({ size }), "text-yellow-400 fill-yellow-400")}
            />
          </span>
        </>
      );

      stars.push(
        editable ? (
          <button
            key={i}
            type="button"
            tabIndex={0}
            aria-label={i === 1 ? "1 star" : `${i} stars`}
            aria-pressed={rating === i}
            className="relative cursor-pointer"
            onClick={() => onRatingChange?.(i)}
            onMouseEnter={() => setHoveredRating(i)}
            onMouseLeave={() => setHoveredRating(null)}
          >
            {star}
          </button>
        ) : (
          <div key={i} className="relative">
            {star}
          </div>
        ),
      );
    }

    return stars;
  };

  return (
    <div
      data-slot="rating"
      role={editable ? "group" : undefined}
      aria-label={editable ? "Rating" : undefined}
      aria-describedby={
        editable ? [ariaDescribedBy, valueId].filter(Boolean).join(" ") : ariaDescribedBy
      }
      className={cn(ratingVariants({ size }), className)}
      {...props}
    >
      <div className="flex items-center">{renderStars()}</div>
      {(showValue || editable) && (
        <span
          id={valueId}
          data-slot="rating-value"
          className={showValue ? cn(valueVariants({ size }), starClassName) : "sr-only"}
        >
          {displayRating.toFixed(1)}
        </span>
      )}
    </div>
  );
}

export { Rating };
