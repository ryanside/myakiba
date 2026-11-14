import "@fontsource-variable/inter/opsz.css";
import "./focus-rings.css";
import type { Currency } from "@myakiba/contracts/shared/types";
import { QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { getCoreRowModel, useReactTable } from "@tanstack/react-table";
import type { ColumnDef } from "@tanstack/react-table";
import { Result } from "better-result";
import { MotionGlobalConfig } from "motion/react";
import ReactDOM from "react-dom/client";
import { InlineCountCell } from "@/components/cells/inline-count-cell";
import { InlineCurrencyCell } from "@/components/cells/inline-currency-cell";
import { InlineReleaseCell } from "@/components/cells/inline-release-cell";
import { InlineTextCell } from "@/components/cells/inline-text-cell";
import { PopoverDatePickerCell } from "@/components/cells/popover-date-picker-cell";
import { PopoverMultiInputCell } from "@/components/cells/popover-multi-input-cell";
import { PopoverRatingCell } from "@/components/cells/popover-rating-cell";
import { PopoverReleaseDateCell } from "@/components/cells/popover-release-date-cell";
import { SelectCell } from "@/components/cells/select-cell";
import {
  DataGrid,
  DataGridContainer,
  NUMERIC_COLUMN_META,
} from "@/components/reui/data-grid/data-grid";
import { DataGridColumnHeader } from "@/components/reui/data-grid/data-grid-column-header";
import { DataGridTable } from "@/components/reui/data-grid/data-grid-table";
import { DatePicker } from "@/components/ui/date-picker";
import { FormSection } from "@/components/ui/form-section";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { createQueryClient } from "@/data/client";

MotionGlobalConfig.skipAnimations = true;
document.documentElement.classList.add("dark");

Object.defineProperty(window, "fetch", {
  value: async () => Response.json({ message: "Not in this harness" }, { status: 404 }),
});

const saved = async () => Result.ok();
const STATUSES = ["Owned", "Ordered", "Paid", "Shipped"] as const;
const NO_RELEASE = {
  releaseDate: null,
  releaseType: null,
  releasePrice: null,
  releaseCurrency: null,
  releaseBarcode: null,
};

type Row = { readonly id: string; readonly shop: string };

const COLUMNS: ColumnDef<Row>[] = [
  {
    id: "status",
    header: ({ column }) => (
      <DataGridColumnHeader title="Status" visibility={true} column={column} />
    ),
    cell: () => <SelectCell label="Status" value="Owned" options={STATUSES} onSubmit={saved} />,
    size: 140,
  },
  {
    id: "shop",
    header: ({ column }) => <DataGridColumnHeader title="Shop" visibility={true} column={column} />,
    cell: ({ row }) => <InlineTextCell label="Shop" value={row.original.shop} onSubmit={saved} />,
    size: 168,
  },
  {
    id: "price",
    header: ({ column }) => (
      <DataGridColumnHeader title="Price" visibility={true} column={column} />
    ),
    cell: () => (
      <InlineCurrencyCell
        label="Price"
        value={17_000}
        currency="USD"
        locale="en-US"
        onSubmit={saved}
      />
    ),
    size: 120,
    meta: NUMERIC_COLUMN_META,
  },
  {
    id: "count",
    header: ({ column }) => (
      <DataGridColumnHeader title="Count" visibility={true} column={column} />
    ),
    cell: () => <InlineCountCell label="Count" value={1} onSubmit={saved} />,
    size: 88,
    meta: NUMERIC_COLUMN_META,
  },
  {
    id: "fees",
    header: ({ column }) => <DataGridColumnHeader title="Fees" visibility={true} column={column} />,
    cell: () => (
      <PopoverMultiInputCell
        inputs={[{ title: "Shipping", type: "currency", value: 1200, name: "shippingFee" }]}
        totalAmount={1200}
        currency="USD"
        locale="en-US"
        onSubmit={saved}
      />
    ),
    size: 110,
    meta: NUMERIC_COLUMN_META,
  },
  {
    id: "score",
    header: ({ column }) => (
      <DataGridColumnHeader title="Score" visibility={true} column={column} />
    ),
    cell: () => <PopoverRatingCell value="7.5" onSubmit={saved} />,
    size: 88,
  },
  {
    id: "ordered",
    header: ({ column }) => (
      <DataGridColumnHeader title="Ordered" visibility={true} column={column} />
    ),
    cell: () => <PopoverDatePickerCell value="2026-03-14" onSubmit={saved} />,
    size: 130,
  },
  {
    id: "release",
    header: ({ column }) => (
      <DataGridColumnHeader title="Release" visibility={true} column={column} />
    ),
    cell: () => (
      <InlineReleaseCell
        releaseId={null}
        itemId="item0000001"
        fallback={NO_RELEASE}
        currency={"USD" satisfies Currency}
        onSubmit={saved}
      />
    ),
    size: 150,
  },
  {
    id: "releaseDate",
    header: ({ column }) => (
      <DataGridColumnHeader title="Release date" visibility={true} column={column} />
    ),
    cell: () => <PopoverReleaseDateCell value={null} orderId="order0000001" onSubmit={saved} />,
    size: 140,
  },
];

const ROWS: Row[] = [
  { id: "row1", shop: "Solaris" },
  { id: "row2", shop: "A shop name far longer than its column is wide" },
];

function Grid({ dense }: { readonly dense: boolean }) {
  const table = useReactTable({
    columns: COLUMNS,
    data: ROWS,
    getRowId: (row) => row.id,
    getCoreRowModel: getCoreRowModel(),
    columnResizeMode: "onChange",
  });
  return (
    <DataGrid
      table={table}
      recordCount={ROWS.length}
      tableLayout={{ dense, columnsResizable: true }}
    >
      <DataGridContainer>
        <DataGridTable />
      </DataGridContainer>
    </DataGrid>
  );
}

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}

function Page() {
  return (
    <main className="flex w-full flex-col gap-10 px-4 py-10">
      <div className="max-w-lg">
        <FormSection title="Basics">
          <div className="grid grid-cols-2 gap-3">
            <Field id="price" label="Price">
              <Input id="price" defaultValue="$170.00" />
            </Field>
            <Field id="count" label="Count">
              <Input id="count" type="number" defaultValue={1} />
            </Field>
          </div>
          <Field id="shop" label="Shop">
            <Input id="shop" defaultValue="Solaris" />
          </Field>
          <Field id="status" label="Status">
            <Select defaultValue="Owned">
              <SelectTrigger id="status" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUSES.map((status) => (
                  <SelectItem key={status} value={status}>
                    {status}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field id="orderDate" label="Order Date">
            <DatePicker id="orderDate" value={null} />
          </Field>
          <Field id="notes" label="Notes">
            <Textarea id="notes" />
          </Field>
        </FormSection>
      </div>
      <Grid dense={false} />
      <Grid dense={true} />
    </main>
  );
}

const router = createRouter({
  routeTree: createRootRoute({ component: Page }),
  history: createMemoryHistory(),
});

const root = document.querySelector("#app");
if (!root) throw new Error("The harness has no #app");
ReactDOM.createRoot(root).render(
  <QueryClientProvider client={createQueryClient()}>
    <RouterProvider router={router} />
  </QueryClientProvider>,
);
