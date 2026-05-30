import type React from "react";
import type { ReactNode } from "react";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { cn } from "@/lib/utils";

function getPageNumbers({
  totalPages,
  currentPage,
}: {
  readonly totalPages: number;
  readonly currentPage: number;
}): readonly (number | "ellipsis")[] {
  const pages: (number | "ellipsis")[] = [];
  const maxVisible = 5;

  if (totalPages <= maxVisible) {
    for (let page = 1; page <= totalPages; page++) {
      pages.push(page);
    }

    return pages;
  }

  pages.push(1);

  if (currentPage > 3) {
    pages.push("ellipsis");
  }

  const start = Math.max(2, currentPage - 1);
  const end = Math.min(totalPages - 1, currentPage + 1);

  for (let page = start; page <= end; page++) {
    pages.push(page);
  }

  if (currentPage < totalPages - 2) {
    pages.push("ellipsis");
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

  const goToPage = (page: number, event: React.MouseEvent): void => {
    event.preventDefault();
    onOffsetChange((page - 1) * limit);
  };

  return (
    <Pagination className="mx-0 w-auto">
      <PaginationContent>
        <PaginationItem>
          <PaginationPrevious
            href="#"
            onClick={(event) => goToPage(currentPage - 1, event)}
            className={cn(
              "cursor-pointer transition-colors duration-150 active:scale-[0.97]",
              currentPage === 1 && "pointer-events-none opacity-50",
            )}
            aria-disabled={currentPage === 1}
            text="Prev"
          />
        </PaginationItem>

        {getPageNumbers({ totalPages, currentPage }).map((page, index) =>
          page === "ellipsis" ? (
            <PaginationItem key={`ellipsis-${index}`}>
              <PaginationEllipsis />
            </PaginationItem>
          ) : (
            <PaginationItem key={page}>
              <PaginationLink
                href="#"
                onClick={(event) => goToPage(page, event)}
                isActive={page === currentPage}
                className="cursor-pointer transition-colors duration-150 active:scale-[0.97]"
              >
                {page}
              </PaginationLink>
            </PaginationItem>
          ),
        )}

        <PaginationItem>
          <PaginationNext
            href="#"
            onClick={(event) => goToPage(currentPage + 1, event)}
            className={cn(
              "cursor-pointer transition-colors duration-150 active:scale-[0.97]",
              currentPage === totalPages && "pointer-events-none opacity-50",
            )}
            aria-disabled={currentPage === totalPages}
          />
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  );
}
