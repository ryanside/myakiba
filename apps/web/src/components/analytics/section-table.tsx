import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AddSquareIcon,
  ArrowDown02Icon,
  ArrowUp02Icon,
  MinusSignSquareIcon,
  UnfoldMoreIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { AnimatePresence, domAnimation, LazyMotion, m } from "motion/react";
import { getCoreRowModel, getExpandedRowModel, useReactTable } from "@tanstack/react-table";
import type {
  Column,
  ColumnDef,
  ExpandedState,
  OnChangeFn,
  Row,
  SortingState,
} from "@tanstack/react-table";
import type { AnalyticsSection } from "@myakiba/contracts/shared/types";
import { formatCurrencyFromMinorUnits } from "@myakiba/utils/currency";
import { DataTable } from "@/components/data-table/data-table";
import { Button } from "@/components/ui/button";
import { useUserPreferences } from "@/hooks/use-user-preferences";
import type {
  AnalyticsSectionRow,
  AnalyticsSectionSort,
  AnalyticsSectionSortOrder,
} from "@/queries/analytics";
import { cn } from "@/lib/utils";
import { ExpandedRowContent } from "@/components/analytics/section-expanded-row";

const ROW_NUMBER_COLUMN_ID = "__rowNumber";
const EXPAND_COLUMN_ID = "__expand";

export function SectionTable({
  rows,
  sectionName,
  offset,
  isLoading,
  sort,
  order,
  onSortChange,
}: {
  readonly rows: readonly AnalyticsSectionRow[];
  readonly sectionName: AnalyticsSection;
  readonly offset: number;
  readonly isLoading: boolean;
  readonly sort?: AnalyticsSectionSort;
  readonly order?: AnalyticsSectionSortOrder;
  readonly onSortChange: (
    sort: AnalyticsSectionSort | undefined,
    order: AnalyticsSectionSortOrder | undefined,
  ) => void;
}): ReactNode {
  const { currency, locale } = useUserPreferences();
  const [expanded, setExpanded] = useState<ExpandedState>({});

  const tableData = useMemo(() => [...rows], [rows]);
  const sorting = useMemo<SortingState>(
    () => (sort && order ? [{ id: sort, desc: order === "desc" }] : []),
    [order, sort],
  );
  const sortingRef = useRef(sorting);

  useEffect(() => {
    sortingRef.current = sorting;
  }, [sorting]);

  const handleSortingChange = useCallback<OnChangeFn<SortingState>>(
    (updater) => {
      const nextSorting = typeof updater === "function" ? updater(sortingRef.current) : updater;
      const nextSort = nextSorting[0];
      let nextOrder: AnalyticsSectionSortOrder | undefined;

      sortingRef.current = nextSorting;

      if (nextSort) {
        nextOrder = nextSort.desc ? "desc" : "asc";
      }

      onSortChange(nextSort?.id as AnalyticsSectionSort | undefined, nextOrder);
    },
    [onSortChange],
  );

  const columns = useMemo<ColumnDef<AnalyticsSectionRow>[]>(
    () => [
      {
        id: EXPAND_COLUMN_ID,
        header: "",
        cell: ({ row }) => <ExpandButton row={row} />,
        size: 32,
      },
      {
        id: ROW_NUMBER_COLUMN_ID,
        header: "#",
        cell: ({ row }) => offset + row.index + 1,
        size: 40,
      },
      {
        id: "name",
        accessorFn: (row) => row.name,
        header: ({ column }) => <SortableHeader column={column} title="name" />,
        cell: ({ getValue }) => getValue() ?? "—",
        sortDescFirst: false,
      },
      {
        id: "itemCount",
        accessorFn: (row) => row.itemCount,
        header: ({ column }) => <SortableHeader column={column} title="count" />,
        cell: ({ getValue }) => getValue() ?? "—",
        size: 80,
        sortDescFirst: false,
      },
      {
        id: "totalSpent",
        accessorFn: (row) => row.totalSpent,
        header: ({ column }) => <SortableHeader column={column} title="spent" />,
        cell: ({ getValue }) => {
          const value = getValue() as number | null;
          return value === null ? "—" : formatCurrencyFromMinorUnits(value, currency, locale);
        },
        size: 100,
        sortDescFirst: false,
      },
    ],
    [currency, locale, offset],
  );

  const table = useReactTable({
    data: tableData,
    columns,
    state: { expanded, sorting },
    onExpandedChange: setExpanded,
    onSortingChange: handleSortingChange,
    getCoreRowModel: getCoreRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    getRowId: (row) => `${sectionName}:${row.id ?? row.name}`,
    getRowCanExpand: () => true,
    enableMultiSort: false,
    enableSortingRemoval: true,
    manualSorting: true,
  });

  return (
    <LazyMotion features={domAnimation}>
      <DataTable.Root
        table={table}
        isLoading={isLoading}
        empty={
          <DataTable.Empty
            title={`No ${sectionName} found`}
            description="Try adjusting your search"
          />
        }
      >
        <DataTable.LoadingSurface>
          <DataTable.Table>
            <DataTable.Header useColumnSizing showSortState />
            <DataTable.Body<AnalyticsSectionRow>
              onRowClick={(row) => row.toggleExpanded()}
              renderExpandedRow={(row) => (
                <ExpandedRowContent row={row.original} sectionName={sectionName} />
              )}
              getCellClassName={(_, columnId) =>
                cn(
                  columnId === ROW_NUMBER_COLUMN_ID && "text-muted-foreground",
                  columnId === EXPAND_COLUMN_ID && "w-8",
                  (columnId === ROW_NUMBER_COLUMN_ID ||
                    columnId === "itemCount" ||
                    columnId === "totalSpent") &&
                    "tabular-nums",
                )
              }
            />
          </DataTable.Table>
        </DataTable.LoadingSurface>
      </DataTable.Root>
    </LazyMotion>
  );
}

function SortableHeader({
  column,
  title,
}: {
  readonly column: Column<AnalyticsSectionRow>;
  readonly title: string;
}): ReactNode {
  const sorted = column.getIsSorted();
  const { icon, nextDirection } = getSortPresentation(sorted);

  return (
    <button
      type="button"
      onClick={column.getToggleSortingHandler()}
      className="-my-1.5 inline-flex min-h-10 items-center gap-1.5 rounded-sm text-left transition-[color,scale] duration-150 ease-out hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 active:scale-[0.96]"
      aria-label={`Sort by ${title}, ${nextDirection}`}
    >
      <span>{title}</span>
      <AnimatePresence initial={false} mode="popLayout">
        <m.span
          key={sorted || "none"}
          initial={{ opacity: 0, scale: 0.25, filter: "blur(4px)" }}
          animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
          exit={{ opacity: 0, scale: 0.25, filter: "blur(4px)" }}
          transition={{ type: "spring", duration: 0.3, bounce: 0 }}
          className="inline-flex"
        >
          <HugeiconsIcon icon={icon} strokeWidth={2} className="size-3.5" />
        </m.span>
      </AnimatePresence>
    </button>
  );
}

function getSortPresentation(sorted: false | "asc" | "desc") {
  if (sorted === "asc") {
    return { icon: ArrowUp02Icon, nextDirection: "descending" } as const;
  }

  if (sorted === "desc") {
    return { icon: ArrowDown02Icon, nextDirection: "default" } as const;
  }

  return { icon: UnfoldMoreIcon, nextDirection: "ascending" } as const;
}

function ExpandButton({ row }: { readonly row: Row<AnalyticsSectionRow> }): ReactNode {
  const isExpanded = row.getIsExpanded();

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={(event) => {
        event.stopPropagation();
        row.toggleExpanded();
      }}
      aria-label={isExpanded ? "Collapse row" : "Expand row"}
      aria-expanded={isExpanded}
    >
      <HugeiconsIcon
        icon={isExpanded ? MinusSignSquareIcon : AddSquareIcon}
        className="size-3.5 text-muted-foreground transition-transform duration-200 ease-out"
      />
    </Button>
  );
}
