import { HugeiconsIcon } from "@hugeicons/react";
import { Loading03Icon } from "@hugeicons/core-free-icons";
import { useForm } from "@tanstack/react-form";
import { Button } from "../ui/button";
import { Label } from "../ui/label";
import { Dropzone, DropzoneContent, DropzoneEmptyState } from "@/components/kibo-ui/dropzone";
import { SyncNotice } from "@/components/sync/sync-notice";
import { transformCSVData } from "@/lib/sync";

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
        className="rounded-lg space-y-4 w-full"
      >
        <SyncNotice />
        <csvForm.Field
          name="file"
          validators={{
            onSubmitAsync: async ({ value }) => {
              try {
                await transformCSVData({ file: value });
              } catch (error) {
                return error instanceof Error
                  ? error.message
                  : "Please select a valid MyFigureCollection CSV file";
              }
            },
          }}
          children={(field) => {
            return (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Label>CSV file</Label>
                  <csvForm.Subscribe
                    selector={(state) => [state.canSubmit, state.isSubmitting]}
                    children={([canSubmit, isSubmitting]) => (
                      <Button
                        type="submit"
                        aria-label="Import CSV"
                        disabled={!canSubmit}
                        variant="default"
                        className="ml-auto"
                      >
                        {isSubmitting ? (
                          <HugeiconsIcon icon={Loading03Icon} className="size-4 animate-spin" />
                        ) : (
                          "Import CSV"
                        )}
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
