import { createFileRoute } from "@tanstack/react-router";
import { client } from "@/lib/hono-client";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import OrdersDataGrid from "@/components/orders/sub-data-grid";
import { useFilters } from "@/hooks/use-filters";
import { z } from "zod";
import { useState } from "react";
import type { RowSelectionState } from "@tanstack/react-table";
import { DebouncedInput } from "@/components/debounced-input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useForm } from "@tanstack/react-form";

const searchSchema = z.object({
  limit: z.coerce.number().optional(),
  offset: z.coerce.number().optional(),
  sort: z
    .enum([
      "title",
      "shop",
      "orderDate",
      "releaseMonthYear",
      "shippingMethod",
      "total",
      "itemCount",
      "createdAt",
    ])
    .optional(),
  order: z.enum(["asc", "desc"]).optional(),
  search: z.string().optional(),
});

export const Route = createFileRoute("/_layout/orders")({
  component: RouteComponent,
  validateSearch: searchSchema,
});

function RouteComponent() {
  const { filters, setFilters, resetFilters } = useFilters(Route.id);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

  async function getOrders(filters: {
    limit?: number;
    offset?: number;
    sort?: string;
    order?: string;
    search?: string;
  }) {
    const queryParams = {
      limit: filters.limit?.toString(),
      offset: filters.offset?.toString(),
      sort: filters.sort?.toString(),
      order: filters.order?.toString(),
      search: filters.search?.toString(),
    };

    const response = await client.api.orders.$get({ query: queryParams });
    if (!response.ok) {
      throw new Error("Failed to get orders");
    }
    const data = await response.json();
    return data;
  }

  const { isPending, isError, data, error } = useQuery({
    queryKey: ["orders", filters],
    queryFn: () => getOrders(filters),
    placeholderData: keepPreviousData,
    staleTime: Infinity,
    retry: false,
  });

  if (isPending) {
    return <div>Loading...</div>;
  }

  if (isError) {
    return <div>Error: {error.message}</div>;
  }
  
  const { orders, totalCount, pagination } = data;

  return (
    <div className="container mx-auto space-y-4">
      <div className="flex items-center justify-between gap-2">
        <DebouncedInput
          value={filters.search ?? ""}
          onChange={(e) => setFilters({ ...filters, search: e.toString() })}
          placeholder="Search"
          className="max-w-xs mr-auto"
        />
        <Dialog>
          <form>
            <DialogTrigger asChild>
              <Button
                variant="primary"
                disabled={Object.keys(rowSelection).length < 2}
              >
                Merge Orders
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>Edit profile</DialogTitle>
                <DialogDescription>
                  Make changes to your profile here. Click save when you&apos;re
                  done.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4">
                <div className="grid gap-3">
                  <Label htmlFor="name-1">Name</Label>
                  <Input id="name-1" name="name" defaultValue="Pedro Duarte" />
                </div>
                <div className="grid gap-3">
                  <Label htmlFor="username-1">Username</Label>
                  <Input
                    id="username-1"
                    name="username"
                    defaultValue="@peduarte"
                  />
                </div>
              </div>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="outline">Cancel</Button>
                </DialogClose>
                <Button type="submit">Save changes</Button>
              </DialogFooter>
            </DialogContent>
          </form>
        </Dialog>
      </div>
      <OrdersDataGrid
        orders={orders}
        totalCount={totalCount}
        pagination={{
          limit: filters.limit ?? 10,
          offset: filters.offset ?? 0,
        }}
        sorting={{
          sort: filters.sort ?? "createdAt",
          order: filters.order ?? "desc",
        }}
        search={filters.search}
        setFilters={setFilters}
        rowSelection={rowSelection}
        setRowSelection={setRowSelection}
      />
    </div>
  );
}
