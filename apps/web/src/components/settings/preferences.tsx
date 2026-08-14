import { HugeiconsIcon } from "@hugeicons/react";
import { Loading03Icon } from "@hugeicons/core-free-icons";
import { authClient } from "@/lib/auth-client";
import { toast } from "@/components/ui/toast";
import { useForm } from "@tanstack/react-form";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { FieldError } from "@/components/ui/field";
import { CurrencySelect } from "@/components/currency-select";
import { useRouter } from "@tanstack/react-router";
import * as z from "zod";
import { formatDateOnlyForDisplay } from "@/lib/date-display";
import { CURRENCIES, DATE_FORMATS } from "@myakiba/contracts/shared/constants";
import type { Currency, DateFormat } from "@myakiba/contracts/shared/types";
import type { User } from "@/lib/auth-client";
import { SettingsGroup, SettingsGroupFooter } from "./settings-group";
import { SettingsRow } from "./settings-row";

export function Preferences({ user }: { user: User }) {
  const router = useRouter();
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
        toast.add({
          type: "error",
          title: error.message || "Failed to update preferences",
        });
        return;
      }

      form.reset(value);
      await router.invalidate();
      toast.add({ type: "success", title: "Preferences updated successfully" });
    },
    validators: {
      onSubmit: z.object({
        currency: z.enum(CURRENCIES),
        dateFormat: z.enum(DATE_FORMATS),
      }),
    },
  });
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        e.stopPropagation();
        form.handleSubmit();
      }}
    >
      <SettingsGroup>
        <form.Field name="currency">
          {(field) => (
            <SettingsRow
              title="Display currency"
              description="Your preferred currency for displaying amounts."
              htmlFor={field.name}
            >
              <CurrencySelect
                id={field.name}
                value={field.state.value as Currency}
                onValueChange={field.handleChange}
                onBlur={field.handleBlur}
                invalid={!field.state.meta.isValid}
              />
              <FieldError errors={field.state.meta.errors} />
            </SettingsRow>
          )}
        </form.Field>

        <form.Field name="dateFormat">
          {(field) => (
            <SettingsRow
              title="Date format"
              description={`e.g. ${formatDateOnlyForDisplay(new Date(), field.state.value as DateFormat)}`}
            >
              <ToggleGroup
                id={field.name}
                aria-label="Date format"
                variant="outline"
                spacing={1}
                value={[field.state.value]}
                onValueChange={(newValue) => {
                  if (newValue.length > 0) {
                    field.handleChange(newValue[0] ?? "");
                  }
                }}
                className="w-full flex-wrap justify-start sm:w-auto sm:justify-end"
              >
                {DATE_FORMATS.map((dateFormat) => (
                  <ToggleGroupItem key={dateFormat} value={dateFormat}>
                    {dateFormat}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              <FieldError errors={field.state.meta.errors} />
            </SettingsRow>
          )}
        </form.Field>

        <SettingsGroupFooter>
          <form.Subscribe>
            {(state) => (
              <Button
                type="submit"
                disabled={!state.isDirty || !state.canSubmit || state.isSubmitting}
              >
                {state.isSubmitting ? (
                  <>
                    <HugeiconsIcon
                      icon={Loading03Icon}
                      className="mr-2 size-4 animate-spin motion-reduce:animate-none"
                    />
                    Saving…
                  </>
                ) : (
                  "Save preferences"
                )}
              </Button>
            )}
          </form.Subscribe>
        </SettingsGroupFooter>
      </SettingsGroup>
    </form>
  );
}
