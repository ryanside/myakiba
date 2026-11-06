import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown02Icon, ArrowUp02Icon, UnfoldMoreIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { AnimatePresence, domAnimation, LazyMotion, m } from "motion/react";
import { ICON_SWAP } from "@/lib/motion";
import {
  functionalUpdate,
  getCoreRowModel,
  getExpandedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import type {
  Column,
  ColumnDef,
  ExpandedState,
  OnChangeFn,
  SortingState,
} from "@tanstack/react-table";
import type { AnalyticsSection } from "@myakiba/contracts/shared/types";
import type {
  AnalyticsSectionSort,
  AnalyticsSectionSortOrder,
} from "@myakiba/contracts/analytics/schema";
import { formatCurrencyFromMinorUnits } from "@myakiba/utils/currency";
import { DataTable, DataTableEmpty, DATA_TABLE_SKELETON } from "@/components/data-table/data-table";
import { RowExpandButton, ROW_EXPAND_SKELETON } from "@/components/data-table/row-expand-button";
import { useUserPreferences } from "@/hooks/use-user-preferences";
import type { AnalyticsSectionRow } from "@/queries/analytics";
import { cn } from "@/lib/utils";
import { ExpandedRowContent } from "@/components/analytics/section-expanded-row";

const ROW_NUMBER_COLUMN_ID = "__rowNumber";
const EXPAND_COLUMN_ID = "__expand";

function createSectionColumns({
  currency,
  locale,
  offset,
}: {
  readonly currency: ReturnType<typeof useUserPreferences>["currency"];
  readonly locale: string;
  readonly offset: number;
}): ColumnDef<AnalyticsSectionRow>[] {
  // Below 440 px the expand button and the figures need more than their size's share, so the
  // narrow table gets its own shares.
  return [
    {
      id: EXPAND_COLUMN_ID,
      header: "",
      cell: ({ row }) => <RowExpandButton row={row} />,
      size: 40,
      meta: { headerClassName: "max-[440px]:w-[11.2%]", skeleton: ROW_EXPAND_SKELETON },
    },
    {
      id: ROW_NUMBER_COLUMN_ID,
      header: "#",
      cell: ({ row }) => offset + row.index + 1,
      size: 40,
      meta: { headerClassName: "max-[440px]:w-[9.7%]", skeleton: DATA_TABLE_SKELETON.rank },
    },
    {
      id: "name",
      accessorFn: (row) => row.name,
      header: ({ column }) => <SortableHeader column={column} title="name" />,
      cell: ({ getValue }) => getValue() ?? "—",
      size: 150,
      sortDescFirst: false,
      meta: { headerClassName: "max-[440px]:w-[32.7%]" },
    },
    {
      id: "itemCount",
      accessorFn: (row) => row.itemCount,
      header: ({ column }) => <SortableHeader column={column} title="count" />,
      cell: ({ getValue }) => getValue() ?? "—",
      size: 80,
      sortDescFirst: false,
      meta: { headerClassName: "max-[440px]:w-[20.6%]", skeleton: DATA_TABLE_SKELETON.count },
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
      meta: { headerClassName: "max-[440px]:w-[25.8%]", skeleton: DATA_TABLE_SKELETON.money },
    },
  ];
}

export function SectionTable({
  rows,
  sectionName,
  offset,
  pageSize,
  isLoading,
  sort,
  order,
  onSortChange,
}: {
  readonly rows: readonly AnalyticsSectionRow[];
  readonly sectionName: AnalyticsSection;
  readonly offset: number;
  readonly pageSize: number;
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
      const nextSorting = functionalUpdate(updater, sortingRef.current);
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
    () => createSectionColumns({ currency, locale, offset }),
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
      <DataTable
        table={table}
        isLoading={isLoading}
        skeletonRowCount={pageSize}
        empty={<DataTableEmpty title={`No ${sectionName} found`} />}
        variant="sized"
        onRowClick={(row) => row.toggleExpanded()}
        renderExpandedRow={(row) => (
          <ExpandedRowContent row={row.original} sectionName={sectionName} />
        )}
        getCellClassName={(_, columnId) =>
          cn(
            columnId === ROW_NUMBER_COLUMN_ID && "text-muted-foreground",
            (columnId === ROW_NUMBER_COLUMN_ID ||
              columnId === "itemCount" ||
              columnId === "totalSpent") &&
              "tabular-nums",
          )
        }
      />
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
      className="-my-1.5 inline-flex min-h-10 items-center gap-1.5 rounded-sm text-left press-text hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      aria-label={`Sort by ${title}, ${nextDirection}`}
    >
      <span>{title}</span>
      <AnimatePresence initial={false} mode="popLayout">
        <m.span key={sorted || "none"} {...ICON_SWAP} className="inline-flex">
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
