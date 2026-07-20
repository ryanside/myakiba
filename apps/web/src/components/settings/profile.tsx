import { HugeiconsIcon } from "@hugeicons/react";
import { Loading03Icon } from "@hugeicons/core-free-icons";
import { authClient } from "@/lib/auth-client";
import { toast } from "sonner";
import { useForm } from "@tanstack/react-form";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRouter } from "@tanstack/react-router";
import * as z from "zod";
import type { User } from "@/lib/auth-client";
import { SettingsSection } from "./settings-section";

export function Profile({ user }: { user: User }) {
  const router = useRouter();
  const form = useForm({
    defaultValues: {
      username: user.username || "",
    },
    onSubmit: async ({ value }) => {
      const { error } = await authClient.updateUser({
        username: value.username,
      });

      if (error) {
        toast.error(error.message || "Failed to update profile");
        return;
      }

      await router.invalidate();
      toast.success("Profile updated successfully");
    },
    validators: {
      onSubmit: z.object({
        username: z
          .string()
          .min(3, "Username must be at least 3 characters")
          .max(30, "Username must be less than 30 characters"),
      }),
    },
  });

  return (
    <SettingsSection title="Profile Information">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          e.stopPropagation();
          form.handleSubmit();
        }}
        className="space-y-4"
      >
        <form.Field
          name="username"
          asyncDebounceMs={1000}
          validators={{
            onChangeAsync: async ({ value }) => {
              if (value.length < 3 || value.length > 30) return;
              if (value === user.username) return;
              const { data, error } = await authClient.isUsernameAvailable({
                username: value,
              });
              if (data?.available === false) return "Username is already taken";
              if (error) return error.message;
            },
            onBlur: z
              .string()
              .min(3, "Username must be at least 3 characters")
              .max(30, "Username must be less than 30 characters"),
          }}
        >
          {(field) => (
            <div className="space-y-2">
              <Label htmlFor={field.name}>Username</Label>
              <Input
                id={field.name}
                name={field.name}
                value={field.state.value}
                type="text"
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
                placeholder="Enter your username"
              />
              <FieldError
                errors={field.state.meta.errors.map((error) =>
                  typeof error === "string" ? { message: error } : { message: error?.message },
                )}
              />
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
                "Save Changes"
              )}
            </Button>
          )}
        </form.Subscribe>
      </form>
    </SettingsSection>
  );
}
