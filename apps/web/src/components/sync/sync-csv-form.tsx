import { useForm } from "@tanstack/react-form";
import { Button } from "../ui/button";
import { Loader2 } from "lucide-react";
import { csvSchema } from "@myakiba/schemas";
import Papa from "papaparse";
import { Label } from "../ui/label";
import { Dropzone, DropzoneContent, DropzoneEmptyState } from "@/components/kibo-ui/dropzone";

export default function SyncCsvForm({
  handleSyncCsvSubmit,
}: {
  handleSyncCsvSubmit: (values: File | undefined) => void;
}) {
  const csvForm = useForm({
    defaultValues: {
      file: undefined as File | undefined,
    },
    onSubmit: async ({ value }) => {
      await handleSyncCsvSubmit(value.file);
      csvForm.reset();
    },
  });
  return (
    <div className="w-full">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          e.stopPropagation();
          void csvForm.handleSubmit();
        }}
        className="rounded-lg border p-4 space-y-4 w-full"
      >
        <csvForm.Field
          name="file"
          validators={{
            onSubmitAsync: async ({ value }) => {
              if (!value) {
                return "No file selected";
              }

              const text = await value.text();
              const parsedCSV = Papa.parse(text, {
                header: true,
                skipEmptyLines: true,
                transformHeader: (header: string) => header.trim().toLowerCase().replace(/ /g, "_"),
              });

              const validatedCSV = csvSchema.safeParse(parsedCSV.data);
              if (!validatedCSV.success) {
                console.log("Invalid CSV file", validatedCSV.error);
                return "Please select a valid MyFigureCollection CSV file";
              }

              const filteredData = validatedCSV.data.filter((item) => {
                return (
                  (item.status === "Owned" || item.status === "Ordered") &&
                  !item.title.startsWith("[NSFW")
                );
              });
              if (filteredData.length === 0) {
                return "No Owned or Ordered items to sync";
              }
            },
          }}
          children={(field) => {
            return (
              <div className="space-y-4">
                <div className="flex flex-row gap-2">
                  <Label className="text-lg text-black dark:text-white">
                    Select MyFigureCollection CSV File
                  </Label>
                  <csvForm.Subscribe
                    selector={(state) => [state.canSubmit, state.isSubmitting]}
                    children={([canSubmit, isSubmitting]) => (
                      <Button
                        type="submit"
                        disabled={!canSubmit}
                        variant="primary"
                        className="ml-auto"
                        size="md"
                      >
                        {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Submit CSV"}
                      </Button>
                    )}
                  />
                </div>
                <Dropzone
                  accept={{ "text/csv": [".csv"] }}
                  maxFiles={1}
                  src={field.state.value ? [field.state.value] : undefined}
                  onDrop={(files) => field.handleChange(files[0] ?? undefined)}
                  onError={(error) => console.error("Dropzone error:", error)}
                >
                  <DropzoneEmptyState />
                  <DropzoneContent />
                </Dropzone>
                {!field.state.meta.isValid && (
                  <em role="alert" className="text-red-500 text-xs">
                    {field.state.meta.errors.join(", ")}
                  </em>
                )}
              </div>
            );
          }}
        />
      </form>
    </div>
  );
}
