import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import { searchSchema as ordersSearchSchema } from "@myakiba/contracts/orders/schema";
import OrdersDataGrid from "@/components/orders/orders-data-grid";
import { toast } from "@/components/ui/toast";
import { renderAppRoute, stubFetch } from "../../../test/app-route";
import { ordersPage } from "../../../test/order";

afterEach(cleanup);

const lists = { unfiltered: "/orders", filtered: "/orders?order=asc" } as const;

const pages = [
  { path: "/orders", component: OrdersDataGrid, validateSearch: ordersSearchSchema },
] as const;

async function renderOrdersGrid(url: string, queryClient: QueryClient) {
  await renderAppRoute(url, pages, queryClient);
  await screen.findByRole("button", { name: "$10.00" });
}

const surfaces = [
  {
    name: "fees",
    submitLabel: "Save",
    edit: async () => {
      fireEvent.click(screen.getByRole("button", { name: "$10.00" }));
      fireEvent.change(await screen.findByLabelText("Shipping"), { target: { value: "2.50" } });
    },
    settled: async () => {
      await screen.findByRole("button", { name: "$10.00" });
    },
  },
  {
    name: "dialog",
    submitLabel: "Update",
    edit: async () => {
      fireEvent.click(screen.getByRole("button", { name: "Edit order" }));
      fireEvent.change(await screen.findByLabelText("Title"), {
        target: { value: "Edited order" },
      });
    },
    settled: async () => {
      await waitFor(() =>
        expect(
          screen.getByRole("button", { name: "Edit order", hidden: true }).hasAttribute("disabled"),
        ).toBe(false),
      );
    },
  },
] as const;

type Surface = (typeof surfaces)[number];

async function saveAndReadToasts(
  surface: Surface,
  url: string,
  respondToEdit: () => Promise<Response>,
) {
  stubFetch((request) => (request.method === "PUT" ? respondToEdit() : Response.json(ordersPage)));
  const added = spyOn(toast, "add");
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  try {
    await renderOrdersGrid(url, queryClient);
    await surface.edit();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: surface.submitLabel }));
    });
    await waitFor(() => expect(added.mock.calls.length).toBeGreaterThan(0));
    await surface.settled();
    return added.mock.calls.map(([options]) => options);
  } finally {
    added.mockRestore();
    cleanup();
    queryClient.clear();
  }
}

async function toastsPerList(surface: Surface, respondToEdit: () => Promise<Response>) {
  return {
    unfiltered: await saveAndReadToasts(surface, lists.unfiltered, respondToEdit),
    filtered: await saveAndReadToasts(surface, lists.filtered, respondToEdit),
  };
}

describe.each(surfaces)("a failed order edit from $name", (surface) => {
  test("shows the server's message when the order no longer exists", async () => {
    const toasts = await toastsPerList(
      surface,
      async () => new Response("Order not found", { status: 404 }),
    );

    const shown = [{ type: "error", title: "Order not found" }];
    expect(toasts).toEqual({ unfiltered: shown, filtered: shown });
  });

  test("keeps the fallback when the server answers 503", async () => {
    const toasts = await toastsPerList(
      surface,
      async () => new Response("Internal failure", { status: 503 }),
    );

    const shown = [{ type: "error", title: "Failed to update order. Please try again." }];
    expect(toasts).toEqual({ unfiltered: shown, filtered: shown });
  });

  test("keeps the fallback when the server cannot be reached", async () => {
    const toasts = await toastsPerList(surface, async () => {
      throw new TypeError("Failed to fetch");
    });

    const shown = [{ type: "error", title: "Failed to update order. Please try again." }];
    expect(toasts).toEqual({ unfiltered: shown, filtered: shown });
  });
});

describe.each(Object.entries(lists))("the edit order sheet on the %s list", (_name, url) => {
  for (const status of [404, 503]) {
    test(`keeps the draft after a ${status} response`, async () => {
      const response = Promise.withResolvers<Response>();
      let requested = false;
      stubFetch((request) => {
        if (request.method === "PUT") {
          requested = true;
          return response.promise;
        }
        return Response.json(ordersPage);
      });
      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
      });
      try {
        await renderOrdersGrid(url, queryClient);
        fireEvent.click(screen.getByRole("button", { name: "Edit order" }));
        fireEvent.change(await screen.findByLabelText("Title"), {
          target: { value: "My unsaved order title" },
        });
        fireEvent.click(screen.getByRole("button", { name: "Update" }));
        await waitFor(() => expect(requested).toBe(true));
        if (url === lists.filtered) {
          expect(
            screen
              .getByRole("button", { name: "Edit order", hidden: true })
              .hasAttribute("disabled"),
          ).toBe(true);
        }
        await act(async () => {
          response.resolve(new Response("Order could not be saved", { status }));
        });
        await waitFor(() =>
          expect(
            screen
              .getByRole("button", { name: "Edit order", hidden: true })
              .hasAttribute("disabled"),
          ).toBe(false),
        );
        expect(screen.getByRole("dialog", { name: "Edit Order" })).toBeTruthy();
        expect(screen.getByLabelText<HTMLInputElement>("Title").value).toBe(
          "My unsaved order title",
        );
        await waitFor(() =>
          expect(screen.getByRole("button", { name: "Update" }).hasAttribute("aria-busy")).toBe(
            false,
          ),
        );
      } finally {
        response.resolve(new Response("Order could not be saved", { status }));
        cleanup();
        queryClient.clear();
      }
    });
  }
});
