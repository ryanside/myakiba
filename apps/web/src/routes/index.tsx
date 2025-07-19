import { createFileRoute } from "@tanstack/react-router";
import Papa from "papaparse";
import { useForm, useStore } from "@tanstack/react-form";
import { useQuery } from "@tanstack/react-query";
import { app } from "../lib/treaty-client";
import { z } from "zod";
import { Label } from "../components/ui/label";
import { Input } from "../components/ui/input";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  component: HomeComponent,
});

const csvSchema = z.array(
  z.object({
    id: z.string(),
    title: z.string(),
    root: z.string(),
    category: z.string(),
    release_date: z.string(),
    price: z.string(),
    scale: z.string(),
    barcode: z.string(),
    status: z.string(),
    count: z.string(),
    score: z.string(),
    payment_date: z.string(),
    shipping_date: z.string(),
    collecting_date: z.string(),
    price_1: z.string(),
    shop: z.string(),
    shipping_method: z.string(),
    tracking_number: z.string(),
    wishibility: z.string().optional(),
    note: z.string(),
  })
);

const fileCheck = z
  .instanceof(File)
  .refine((file) => file.type === "text/csv", {
    message: "Only MFC CSV file allowed",
  })
  .refine((file) => file.size <= 10_000_000, {
    message: "File size must be less than 10MB",
  });

function HomeComponent() {
  const form = useForm({
    defaultValues: {
      file: undefined as File | undefined,
    },
    onSubmit: async ({ value }) => {
      const startTime = Date.now();
      console.log("onSubmit: Client-side CSV validation & filtering started");

      if (!value.file) return "No file selected";
      const text = await value.file.text();
      const parsedCSV = Papa.parse(text, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (header) =>
          header.trim().toLowerCase().replace(/ /g, "_"),
      });
      console.log("CSV parsed");
      const validatedCSV = csvSchema.safeParse(parsedCSV.data);
      if (!validatedCSV.success) {
        console.log("Invalid CSV file", validatedCSV.error);
        return "Please select a valid MyFigureCollection CSV file";
      }
      console.log("CSV validated");

      const filteredData = validatedCSV.data.filter((item) => {
        return item.status === "Owned" || item.status === "Ordered";
      });

      if (filteredData.length === 0) {
        return "No Owned or Ordered figures to sync";
      }

      console.log("Filtered data:", filteredData);

      const figureIDs = filteredData.map((item) => item.id);
      const userFigureData = filteredData.map((item) => {
        return {
          id: item.id,
          status: item.status,
          count: Number(item.count),
          score: Number(item.score.split("/")[0]),
          payment_date: item.payment_date,
          shipping_date: item.shipping_date,
          collecting_date: item.collecting_date,
          price: Number(item.price_1),
          shop: item.shop,
          shipping_method: item.shipping_method,
          tracking_number: item.tracking_number,
          note: item.note,
        };
      });

      console.log("Figure IDs:", figureIDs);
      console.log("User figure data:", userFigureData);

      const response = await app.sync.post({ figureData: userFigureData });
      console.log("Response:", response);

      console.log(`onSubmit: Time taken: ${Date.now() - startTime}ms`);
    },
    validators: {
      onChangeAsync: async ({ value }) => {
        const startTime = Date.now();
        console.log(
          "onChangeAsync: Client-side CSV validation & filtering started"
        );

        if (!value.file) return "No file selected";
        const text = await value.file.text();
        const parsedCSV = Papa.parse(text, {
          header: true,
          skipEmptyLines: true,
          transformHeader: (header) =>
            header.trim().toLowerCase().replace(/ /g, "_"),
        });
        console.log("CSV parsed");
        const validatedCSV = csvSchema.safeParse(parsedCSV.data);
        if (!validatedCSV.success) {
          console.log("Invalid CSV file", validatedCSV.error);
          return "Please select a valid MyFigureCollection CSV file";
        }
        console.log("CSV validated");

        const filteredData = validatedCSV.data.filter((item) => {
          return item.status === "Owned" || item.status === "Ordered";
        });

        if (filteredData.length === 0) {
          return "No Owned or Ordered figures to sync";
        }
        console.log(`onChangeAsync: Time taken: ${Date.now() - startTime}ms`);
      },
    },
  });

  const formErrorMap = useStore(form.store, (state) => state.errorMap);

  const { data, refetch, isLoading, error } = useQuery({
    queryKey: ["test-api"],
    queryFn: async () => {
      const response = await app.hi.get();
      return response;
    },
    enabled: false, // Don't auto-fetch on mount
  });

  return (
    <div className="container mx-auto max-w-3xl px-4 py-2">
      <div className="grid gap-6">
        <section className="rounded-lg border p-4">
          <h2 className="mb-2 font-medium">API Status</h2>
          <button
            onClick={() => refetch()}
            disabled={isLoading}
            className="mb-2 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
          >
            {isLoading ? "Loading..." : "Test API"}
          </button>
          {error && (
            <div className="text-red-500 text-sm">
              Error: {error instanceof Error ? error.message : "Unknown error"}
            </div>
          )}
          {data && (
            <div className="text-green-600 text-sm">Response: {data.data}</div>
          )}
        </section>
        <section className="rounded-lg border p-4">
          <h2 className="mb-2 font-medium">Sync with your MFC</h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              e.stopPropagation();
              void form.handleSubmit();
            }}
          >
            <form.Field
              name="file"
              children={(field) => {
                return (
                  <div className="space-y-2">
                    <Label htmlFor="csv-file">Select CSV File</Label>
                    <Input
                      id="csv-file"
                      type="file"
                      accept=".csv,text/csv"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        field.handleChange(file);
                      }}
                      className="file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                    />
                    {formErrorMap.onChange ? (
                      <div>
                        <em role="alert">{formErrorMap.onChange}</em>
                      </div>
                    ) : null}
                    <Button type="submit">Submit</Button>
                  </div>
                );
              }}
            />
          </form>
        </section>
      </div>
    </div>
  );
}
