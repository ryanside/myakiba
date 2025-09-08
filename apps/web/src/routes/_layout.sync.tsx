import { authClient } from "@/lib/auth-client";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { z } from "zod";
import { useForm } from "@tanstack/react-form";
import Papa from "papaparse";
import { client } from "@/lib/hono-client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useStore } from "@tanstack/react-form";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_layout/sync")({
  component: RouteComponent,
});

const csvItemSchema = z.object({
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
});
const csvSchema = z.array(csvItemSchema);

type userItem = {
  id: number;
  status: string;
  count: number;
  score: string;
  payment_date: string;
  shipping_date: string;
  collecting_date: string;
  price: string;
  shop: string;
  shipping_method: string;
  note: string;
  orderId: null;
  orderDate: string;
};

function RouteComponent() {
  const { data: session, isPending } = authClient.useSession();
  const navigate = Route.useNavigate();
  const queryClient = useQueryClient();

  useEffect(() => {
    // Add a small delay to avoid race condition with sign-in
    const timeoutId = setTimeout(() => {
      if (!session && !isPending) {
        navigate({
          to: "/login",
        });
      }
    }, 100);

    return () => clearTimeout(timeoutId);
  }, [session, isPending, navigate]);

  const form = useForm({
    defaultValues: {
      file: undefined as File | undefined,
    },
    onSubmit: async ({ value }) => {
      const startTime = Date.now();
      if (!value.file) {
        return "No file selected";
      }

      const text = await value.file.text();
      const parsedCSV = Papa.parse(text, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (header: string) =>
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
        return (
          (item.status === "Owned" || item.status === "Ordered") &&
          !item.title.startsWith("[NSFW")
        );
      });
      if (filteredData.length === 0) {
        return "No Owned or Ordered items to sync";
      }
      console.log("Filtered data:", filteredData);
      const itemIDs = filteredData.map((item) => item.id);
      const userItems: userItem[] = filteredData.map((item) => {
        return {
          id: Number(item.id),
          status: item.status,
          count: Number(item.count),
          score: item.score.split("/")[0],
          payment_date: item.payment_date,
          shipping_date: item.shipping_date,
          collecting_date: item.collecting_date,
          price: item.price_1,
          shop: item.shop,
          shipping_method: item.shipping_method,
          note: item.note,
          orderId: null,
          orderDate: item.payment_date,
        };
      });

      try {
        const result = await mutation.mutateAsync(userItems);
        const jobId = result?.jobId;

        if (jobId) {
          const interval = setInterval(async () => {
            try {
              const data = await queryClient.fetchQuery({
                queryKey: ["job-status", jobId],
                queryFn: () => getJobStatus(jobId),
              });

              console.log(data?.status);

              if (data?.finished) {
                clearInterval(interval);
              }
            } catch (error) {
              clearInterval(interval);
              console.log(error);
            }
          }, 3000);
        }
      } catch (error) {
        console.error("Error sendItems()", error);
        return error instanceof Error ? error.message : "An error occurred";
      }
    },
  });

  const formErrorMap = useStore(form.store, (state) => state.errorMap);

  async function getJobStatus(jobId: string) {
    const response = await client.api.sync.$get({
      query: {
        jobId: jobId,
      },
    });
    if (!response.ok) {
      throw new Error("Failed to get job status");
    }
    return response.json();
  }

  const mutation = useMutation({
    mutationFn: (userItems: userItem[]) => sendItems(userItems),
  });

  async function sendItems(userItems: userItem[]) {
    const response = await client.api.sync.$post({
      json: userItems,
    });
    if (!response.ok) {
      throw new Error("Failed to send items to server");
    }
    return response.json();
  }

  if (isPending) {
    return <div>Loading...</div>;
  }

  return (
    <div className="container mx-auto max-w-3xl px-4 py-2">
      <h1>Dashboard</h1>
      <p>Welcome {session?.user.name}</p>
      <div className="grid gap-6">
        {/* Authentication Status */}
        {!session && !isPending && (
          <section className="rounded-lg border border-orange-200 bg-orange-50 p-4">
            <h2 className="mb-2 font-medium text-orange-800">
              Authentication Required
            </h2>
            <p className="text-orange-700 text-sm">
              Please{" "}
              <a href="/login" className="underline hover:text-orange-900">
                sign in
              </a>{" "}
              to sync your MFC data.
            </p>
          </section>
        )}

        <section className="rounded-lg border p-4">
          <h2 className="mb-2 font-medium">Sync with your MFC</h2>
          {session ? (
            <p className="text-green-600 text-sm mb-4">
              Signed in as: {session.user.email}
            </p>
          ) : (
            <p className="text-gray-500 text-sm mb-4">
              Sign in required to sync data
            </p>
          )}

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
                      disabled={!session}
                    />
                    {formErrorMap.onChange ? (
                      <div>
                        <em role="alert">{formErrorMap.onChange}</em>
                      </div>
                    ) : null}
                    <Button type="submit" disabled={!session || isPending}>
                      {!session ? "Sign in to Submit" : "Submit"}
                    </Button>
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
