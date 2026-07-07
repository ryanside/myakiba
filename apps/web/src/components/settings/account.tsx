import { HugeiconsIcon } from "@hugeicons/react";
import { Loading03Icon } from "@hugeicons/core-free-icons";
import { useQuery } from "@tanstack/react-query";
import { getAccountType } from "@/queries/settings";
import { authClient } from "@/lib/auth-client";
import { toast } from "sonner";
import { useForm } from "@tanstack/react-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError } from "@/components/ui/field";
import * as z from "zod";
import { SettingsSection } from "./settings-section";

const PASSWORD_FIELDS = [
  { name: "currentPassword", label: "Current Password", placeholder: "Enter current password" },
  { name: "newPassword", label: "New Password", placeholder: "Enter new password" },
  {
    name: "confirmPassword",
    label: "Confirm New Password",
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
    <SettingsSection title="Change Password">
      {showOAuthNote && (
        <p className="text-sm text-muted-foreground mb-4">
          Password is managed by your sign-in provider.
        </p>
      )}
      {isError && (
        <p className="text-sm text-destructive text-pretty mb-4">
          Failed to load account settings: {error?.message}
        </p>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          e.stopPropagation();
          form.handleSubmit();
        }}
        className="space-y-4"
      >
        {PASSWORD_FIELDS.map(({ name, label, placeholder }) => (
          <form.Field key={name} name={name}>
            {(field) => (
              <div className="space-y-2">
                <Label htmlFor={field.name}>{label}</Label>
                <Input
                  id={field.name}
                  name={field.name}
                  type="password"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                  placeholder={placeholder}
                  disabled={isFormDisabled}
                />
                <FieldError errors={field.state.meta.errors} />
              </div>
            )}
          </form.Field>
        ))}

        <form.Subscribe>
          {(state) => (
            <Button
              type="submit"
              disabled={isFormDisabled || !state.canSubmit || state.isSubmitting}
            >
              {state.isSubmitting ? (
                <>
                  <HugeiconsIcon icon={Loading03Icon} className="mr-2 size-4 animate-spin" />
                  Changing...
                </>
              ) : (
                "Change Password"
              )}
            </Button>
          )}
        </form.Subscribe>
      </form>
    </SettingsSection>
  );
}
