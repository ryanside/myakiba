import { HugeiconsIcon } from "@hugeicons/react";
import { Loading03Icon } from "@hugeicons/core-free-icons";
import { authClient } from "@/lib/auth-client";
import { toast } from "sonner";
import { useForm } from "@tanstack/react-form";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { FieldError } from "@/components/ui/field";
import { CurrencySelect } from "@/components/currency-select";
import * as z from "zod";
import { formatDateOnlyForDisplay } from "@/lib/date-display";
import { CURRENCIES, DATE_FORMATS } from "@myakiba/contracts/shared/constants";
import type { Currency, DateFormat } from "@myakiba/contracts/shared/types";
import type { User } from "@/lib/auth-client";
import { SettingsSection } from "./settings-section";

export function Preferences({ user }: { user: User }) {
  const form = useForm({
    defaultValues: {
      currency: user.currency,
      dateFormat: user.dateFormat,
    },
    onSubmit: async ({ value }) => {
      const { error } = await authClient.updateUser({
        currency: value.currency,
        dateFormat: value.dateFormat,
      });

      if (error) {
        toast.error(error.message || "Failed to update preferences");
        return;
      }

      toast.success("Preferences updated successfully");
    },
    validators: {
      onSubmit: z.object({
        currency: z.enum(CURRENCIES),
        dateFormat: z.enum(DATE_FORMATS),
      }),
    },
  });

  return (
    <SettingsSection title="Preferences">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          e.stopPropagation();
          form.handleSubmit();
        }}
        className="space-y-4"
      >
        <form.Field name="currency">
          {(field) => (
            <div className="flex flex-col gap-2">
              <Label htmlFor={field.name}>Display Currency</Label>
              <CurrencySelect
                id={field.name}
                value={field.state.value as Currency}
                onValueChange={field.handleChange}
                onBlur={field.handleBlur}
                invalid={!field.state.meta.isValid}
              />
              <FieldError errors={field.state.meta.errors} />
            </div>
          )}
        </form.Field>

        <form.Field name="dateFormat">
          {(field) => (
            <div className="flex flex-col gap-2">
              <div className="flex flex-col gap-1">
                <Label htmlFor={field.name}>Date Format</Label>
                <span className="text-xs text-muted-foreground">
                  e.g. {formatDateOnlyForDisplay(new Date(), field.state.value as DateFormat)}
                </span>
              </div>
              <ToggleGroup
                id={field.name}
                variant="outline"
                spacing={1}
                value={[field.state.value]}
                onValueChange={(newValue) => {
                  if (newValue.length > 0) {
                    field.handleChange(newValue[0] ?? "");
                  }
                }}
                className="flex-wrap"
              >
                {DATE_FORMATS.map((dateFormat) => (
                  <ToggleGroupItem key={dateFormat} value={dateFormat}>
                    {dateFormat}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              <FieldError errors={field.state.meta.errors} />
            </div>
          )}
        </form.Field>

        <form.Subscribe>
          {(state) => (
            <Button type="submit" disabled={!state.canSubmit || state.isSubmitting}>
              {state.isSubmitting ? (
                <>
                  <HugeiconsIcon icon={Loading03Icon} className="mr-2 size-4 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Preferences"
              )}
            </Button>
          )}
        </form.Subscribe>
      </form>
    </SettingsSection>
  );
}
