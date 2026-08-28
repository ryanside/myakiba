import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

export function InfiniteListStatus({
  hasNextPage,
  isFetchingNextPage,
  isFetchNextPageError,
  disabled = false,
  onLoadMore,
}: {
  readonly hasNextPage: boolean;
  readonly isFetchingNextPage: boolean;
  readonly isFetchNextPageError: boolean;
  readonly disabled?: boolean;
  readonly onLoadMore: () => Promise<unknown>;
}): React.JSX.Element | null {
  const statusRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const status = statusRef.current;
    if (!(status && hasNextPage) || isFetchingNextPage || isFetchNextPageError || disabled) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) void onLoadMore();
      },
      { rootMargin: "600px 0px" },
    );
    observer.observe(status);
    return () => observer.disconnect();
  }, [disabled, hasNextPage, isFetchNextPageError, isFetchingNextPage, onLoadMore]);

  if (!hasNextPage) return null;

  return (
    <div
      ref={statusRef}
      className="flex min-h-12 w-full items-center justify-center text-sm text-muted-foreground"
    >
      {isFetchNextPageError ? (
        <div className="flex items-center gap-2">
          <span role="alert">Could not load more.</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={async () => {
              try {
                await onLoadMore();
              } catch {
                // The status row keeps the retry action visible.
              }
            }}
          >
            Retry
          </Button>
        </div>
      ) : null}
      {!isFetchNextPageError && isFetchingNextPage ? (
        <span className="flex items-center gap-2" role="status" aria-live="polite">
          <Spinner /> Loading more
        </span>
      ) : null}
      {!isFetchNextPageError && !isFetchingNextPage ? <span>Scroll to load more</span> : null}
    </div>
  );
}
