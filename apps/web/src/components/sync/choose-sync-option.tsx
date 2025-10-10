import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldSet,
  FieldTitle,
} from "@/components/ui/field";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useForm } from "@tanstack/react-form";
import * as z from "zod";
import { Button } from "../ui/button";
import { Loader2 } from "lucide-react";
export default function ChooseSyncOption({
  handleSyncOption,
}: {
  handleSyncOption: (option: "csv" | "order" | "collection") => void;
}) {
  const form = useForm({
    defaultValues: {
      syncOption: "collection" as "csv" | "order" | "collection",
    },
    onSubmit: async ({ value }) => {
      handleSyncOption(value.syncOption);
    },
  });
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        e.stopPropagation();
        void form.handleSubmit();
      }}
      className="rounded-lg border p-4 space-y-4 w-full"
    >
      <FieldGroup>
        <FieldSet className="flex flex-col gap-4 justify-center">
          <div className="flex flex-row py-1">
            <div className="flex flex-col gap-0">
              <FieldLabel htmlFor="sync-option">
                Choose a sync option
              </FieldLabel>
              <FieldDescription>
                Select an option to add items from MyFigureCollection.
              </FieldDescription>
            </div>
            <form.Subscribe
              selector={(state) => [state.canSubmit, state.isSubmitting]}
              children={([canSubmit, isSubmitting]) => (
                <Button
                  type="submit"
                  disabled={!canSubmit}
                  variant="primary"
                  className="ml-auto"
                  size="md"
                >
                  {isSubmitting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    "Next"
                  )}
                </Button>
              )}
            />
          </div>
          <form.Field
            name="syncOption"
            validators={{
              onChange: z.enum(
                ["csv", "order", "collection"],
                "Sync option is required"
              ),
            }}
            children={(field) => (
              <RadioGroup
                defaultValue="collection"
                onValueChange={(value) => {
                  field.handleChange(value as typeof field.state.value);
                }}
              >
                <FieldLabel htmlFor="collection">
                  <Field orientation="horizontal">
                    <FieldContent>
                      <FieldTitle>Collection</FieldTitle>
                      <FieldDescription>
                        Add to your collection using MyFigureCollection Item
                        IDs.
                      </FieldDescription>
                    </FieldContent>
                    <RadioGroupItem value="collection" id="collection" />
                  </Field>
                </FieldLabel>
                <FieldLabel htmlFor="order">
                  <Field orientation="horizontal">
                    <FieldContent>
                      <FieldTitle>Order</FieldTitle>
                      <FieldDescription>
                        Create and add an order using MyFigureCollection Item
                        IDs.
                      </FieldDescription>
                    </FieldContent>
                    <RadioGroupItem value="order" id="order" />
                  </Field>
                </FieldLabel>
                <FieldLabel htmlFor="csv">
                  <Field orientation="horizontal">
                    <FieldContent>
                      <FieldTitle>
                        MyFigureCollection CSV{" "}
                        <span className="text-primary font-light text-xs">
                          (Recommended for onboarding)
                        </span>
                      </FieldTitle>
                      <div className="flex flex-col gap-0">
                        <FieldDescription>
                          Sync your MyFigureCollection and myakiba using
                          MyFigureCollection CSV.
                        </FieldDescription>
                        <FieldDescription className="italic font-light">
                          {`You can export your MyFigureCollection
                        CSV by going to https://myfigurecollection.net > User Menu > Manager > CSV Export (with all fields checked).`}
                        </FieldDescription>
                      </div>
                    </FieldContent>
                    <RadioGroupItem value="csv" id="csv" />
                  </Field>
                </FieldLabel>
              </RadioGroup>
            )}
          />
        </FieldSet>
      </FieldGroup>
    </form>
  );
}
