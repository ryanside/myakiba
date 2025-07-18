import { createFileRoute } from "@tanstack/react-router";
import Papa from "papaparse";
import { useForm } from "@tanstack/react-form";
import { useQuery } from "@tanstack/react-query";
import { app } from "../lib/treaty-client";

export const Route = createFileRoute("/")({
  component: HomeComponent,
});

function HomeComponent() {
  // const form = useForm({
  //   defaultValues: {
  //     file: null as File | null,
  //   },
  //   onSubmit: async ({ value }) => {
  //     const file = value.file;
  //     if (!file) return;

  //     const text = await file.text();
  //     const result = Papa.parse(text, { header: true });
  //     const data = result.data;
  //     console.log(data);
  //   },
  // });

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
            <div className="text-green-600 text-sm">
              Response: {data.data}
            </div>
          )}
        </section>
        <section className="rounded-lg border p-4">
          <h2 className="mb-2 font-medium">Sync with your MFC</h2>
          <form action=""></form>
        </section>
      </div>
    </div>
  );
}
