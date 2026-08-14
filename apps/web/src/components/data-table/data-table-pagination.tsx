import type { ReactNode } from "react";
import { ArrowLeft01Icon, ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Pagination, PaginationContent, PaginationItem } from "@/components/ui/pagination";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function getPageNumbers({
  totalPages,
  currentPage,
}: {
  readonly totalPages: number;
  readonly currentPage: number;
}): readonly (number | "ellipsis-start" | "ellipsis-end")[] {
  const pages: (number | "ellipsis-start" | "ellipsis-end")[] = [];
  const maxVisible = 5;

  if (totalPages <= maxVisible) {
    for (let page = 1; page <= totalPages; page++) {
      pages.push(page);
    }

    return pages;
  }

  pages.push(1);

  if (currentPage > 3) {
    pages.push("ellipsis-start");
  }

  const start = Math.max(2, currentPage - 1);
  const end = Math.min(totalPages - 1, currentPage + 1);

  for (let page = start; page <= end; page++) {
    pages.push(page);
  }

  if (currentPage < totalPages - 2) {
    pages.push("ellipsis-end");
  }

  pages.push(totalPages);

  return pages;
}

export function DataTablePagination({
  totalCount,
  limit,
  offset,
  onOffsetChange,
}: {
  readonly totalCount: number;
  readonly limit: number;
  readonly offset: number;
  readonly onOffsetChange: (offset: number) => void;
}): ReactNode {
  const totalPages = Math.ceil(totalCount / limit);
  const currentPage = Math.floor(offset / limit) + 1;

  if (totalPages <= 1) {
    return null;
  }

  const goToPage = (page: number): void => {
    onOffsetChange((page - 1) * limit);
  };

  const buttonClasses = "size-7 p-0 text-sm";
  const arrowButtonClasses = `${buttonClasses} rtl:transform rtl:rotate-180`;

  return (
    <Pagination className="mx-0 w-auto">
      <PaginationContent className="gap-1">
        <PaginationItem>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            className={arrowButtonClasses}
            onClick={() => goToPage(currentPage - 1)}
            disabled={currentPage === 1}
          >
            <span className="sr-only">Go to previous page</span>
            <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={2} className="size-4" />
          </Button>
        </PaginationItem>

        {getPageNumbers({ totalPages, currentPage }).map((page) =>
          page === "ellipsis-start" || page === "ellipsis-end" ? (
            <PaginationItem key={page}>
              <span
                aria-hidden
                className="flex size-7 items-center justify-center text-sm text-muted-foreground"
              >
                ...
              </span>
            </PaginationItem>
          ) : (
            <PaginationItem key={page}>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                aria-current={page === currentPage ? "page" : undefined}
                className={cn(buttonClasses, "text-muted-foreground", {
                  "bg-accent text-accent-foreground": page === currentPage,
                })}
                onClick={() => goToPage(page)}
              >
                {page}
              </Button>
            </PaginationItem>
          ),
        )}

        <PaginationItem>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            className={arrowButtonClasses}
            onClick={() => goToPage(currentPage + 1)}
            disabled={currentPage === totalPages}
          >
            <span className="sr-only">Go to next page</span>
            <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} className="size-4" />
          </Button>
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  );
}
