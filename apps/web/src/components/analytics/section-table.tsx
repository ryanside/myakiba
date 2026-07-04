import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { AddSquareIcon, MinusSignSquareIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { getCoreRowModel, getExpandedRowModel, useReactTable } from "@tanstack/react-table";
import type { ColumnDef, ExpandedState, Row } from "@tanstack/react-table";
import type { AnalyticsSection } from "@myakiba/contracts/shared/types";
import { formatCurrencyFromMinorUnits } from "@myakiba/utils/currency";
import { DataTable } from "@/components/data-table/data-table";
import { Button } from "@/components/ui/button";
import { useUserPreferences } from "@/hooks/use-user-preferences";
import type { AnalyticsSectionRow } from "@/queries/analytics";
import { cn } from "@/lib/utils";
import { ExpandedRowContent } from "@/components/analytics/section-expanded-row";

const ROW_NUMBER_COLUMN_ID = "__rowNumber";
const EXPAND_COLUMN_ID = "__expand";

export function SectionTable({
  rows,
  sectionName,
  offset,
  isLoading,
}: {
  readonly rows: readonly AnalyticsSectionRow[];
  readonly sectionName: AnalyticsSection;
  readonly offset: number;
  readonly isLoading: boolean;
}): ReactNode {
  const { currency, locale } = useUserPreferences();
  const [expanded, setExpanded] = useState<ExpandedState>({});

  const tableData = useMemo(() => [...rows], [rows]);

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
        header: "name",
        cell: ({ getValue }) => getValue() ?? "—",
      },
      {
        id: "itemCount",
        accessorFn: (row) => row.itemCount,
        header: "count",
        cell: ({ getValue }) => getValue() ?? "—",
        size: 80,
      },
      {
        id: "totalSpent",
        accessorFn: (row) => row.totalSpent,
        header: "spent",
        cell: ({ getValue }) => {
          const value = getValue() as number | null;
          return value === null ? "—" : formatCurrencyFromMinorUnits(value, currency, locale);
        },
        size: 100,
      },
    ],
    [currency, locale, offset],
  );

  const table = useReactTable({
    data: tableData,
    columns,
    state: { expanded },
    onExpandedChange: setExpanded,
    getCoreRowModel: getCoreRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    getRowId: (row, index) => row.id ?? `row-${index}`,
    getRowCanExpand: () => true,
  });

  return (
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
          <DataTable.Header useColumnSizing />
          <DataTable.Body<AnalyticsSectionRow>
            onRowClick={(row) => row.toggleExpanded()}
            renderExpandedRow={(row) => (
              <ExpandedRowContent row={row.original} sectionName={sectionName} />
            )}
            getCellClassName={(_, columnId) =>
              cn(
                columnId === ROW_NUMBER_COLUMN_ID && "text-muted-foreground",
                columnId === EXPAND_COLUMN_ID && "w-8",
              )
            }
          />
        </DataTable.Table>
      </DataTable.LoadingSurface>
    </DataTable.Root>
  );
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
