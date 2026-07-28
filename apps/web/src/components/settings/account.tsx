import { HugeiconsIcon } from "@hugeicons/react";
import { Loading03Icon } from "@hugeicons/core-free-icons";
import { useQuery } from "@tanstack/react-query";
import { getAccountType } from "@/queries/settings";
import { authClient } from "@/lib/auth-client";
import { toast } from "sonner";
import { useForm } from "@tanstack/react-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FieldError } from "@/components/ui/field";
import * as z from "zod";
import { DeleteAccount } from "./delete-account";
import { SettingsGroup, SettingsGroupFooter } from "./settings-group";
import { SettingsRow } from "./settings-row";

const PASSWORD_FIELDS = [
  {
    name: "currentPassword",
    title: "Current password",
    description: "Confirm it's you before changing your password.",
    placeholder: "Enter current password",
  },
  {
    name: "newPassword",
    title: "New password",
    description: "Use at least 8 characters.",
    placeholder: "Enter new password",
  },
  {
    name: "confirmPassword",
    title: "Confirm new password",
    description: "Re-enter the new password to confirm.",
    placeholder: "Confirm new password",
  },
] as const;

export function Account() {
  const { data, isPending, isError, error } = useQuery({
    queryKey: ["account-type"],
    queryFn: getAccountType,
    staleTime: 1000 * 60 * 5,
    retry: false,
  });
  const hasCredentialAccount = data?.hasCredentialAccount ?? false;
  const isFormDisabled = isPending || isError || !hasCredentialAccount;
  const showOAuthNote = !isPending && !isError && !hasCredentialAccount;

  const form = useForm({
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    },
    onSubmit: async ({ value }) => {
      if (value.newPassword !== value.confirmPassword) {
        toast.error("New passwords do not match");
        return;
      }

      await authClient.changePassword(
        {
          newPassword: value.newPassword,
          currentPassword: value.currentPassword,
          revokeOtherSessions: true,
        },
        {
          onSuccess: () => {
            toast.success("Password changed successfully");
            form.reset();
          },
          onError: (changePasswordError) => {
            toast.error(changePasswordError.error.message || "Failed to change password");
          },
        },
      );
    },
    validators: {
      onSubmit: z.object({
        currentPassword: z.string().min(8, "Password must be at least 8 characters"),
        newPassword: z.string().min(8, "Password must be at least 8 characters"),
        confirmPassword: z.string().min(8, "Password must be at least 8 characters"),
      }),
    },
  });
  return (
    <div className="flex flex-col gap-4">
      {showOAuthNote ? (
        <p className="text-sm text-muted-foreground">
          Password is managed by your sign-in provider.
        </p>
      ) : null}
      {isError ? (
        <p className="text-pretty text-sm text-destructive">
          Failed to load account settings: {error?.message}
        </p>
      ) : null}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          e.stopPropagation();
          form.handleSubmit();
        }}
        className="flex flex-col gap-4"
      >
        <SettingsGroup title="Change password">
          {PASSWORD_FIELDS.map(({ name, title, description, placeholder }) => (
            <form.Field key={name} name={name}>
              {(field) => (
                <SettingsRow title={title} description={description} htmlFor={field.name}>
                  <Input
                    id={field.name}
                    name={field.name}
                    type="password"
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                    placeholder={placeholder}
                    disabled={isFormDisabled}
                    className="sm:w-64"
                  />
                  <FieldError errors={field.state.meta.errors} />
                </SettingsRow>
              )}
            </form.Field>
          ))}

          <SettingsGroupFooter>
            <form.Subscribe>
              {(state) => {
                const passwordsAreValid =
                  state.values.currentPassword.length >= 8 &&
                  state.values.newPassword.length >= 8 &&
                  state.values.confirmPassword.length >= 8 &&
                  state.values.newPassword === state.values.confirmPassword;

                return (
                  <Button
                    type="submit"
                    disabled={
                      isFormDisabled ||
                      !state.isDirty ||
                      !passwordsAreValid ||
                      !state.canSubmit ||
                      state.isSubmitting
                    }
                  >
                    {state.isSubmitting ? (
                      <>
                        <HugeiconsIcon
                          icon={Loading03Icon}
                          className="mr-2 size-4 animate-spin motion-reduce:animate-none"
                        />
                        Updating…
                      </>
                    ) : (
                      "Update password"
                    )}
                  </Button>
                );
              }}
            </form.Subscribe>
          </SettingsGroupFooter>
        </SettingsGroup>
      </form>

      <DeleteAccount />
    </div>
  );
}
