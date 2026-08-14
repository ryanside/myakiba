import { HugeiconsIcon } from "@hugeicons/react";
import { Delete02Icon, Loading03Icon } from "@hugeicons/core-free-icons";
import { useNavigate } from "@tanstack/react-router";
import { authClient } from "@/lib/auth-client";
import { toast } from "@/components/ui/toast";
import { useForm } from "@tanstack/react-form";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getAccountType } from "@/queries/settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError } from "@/components/ui/field";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import * as z from "zod";
import { SettingsGroup } from "./settings-group";
import { SettingsRow } from "./settings-row";

export function DeleteAccount() {
  const { data, isPending, isError, error } = useQuery({
    queryKey: ["account-type"],
    queryFn: getAccountType,
    staleTime: 1000 * 60 * 5,
    retry: false,
  });
  const hasCredentialAccount = data?.hasCredentialAccount ?? false;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isTriggerDisabled = isPending || isError;

  const completeAccountDeletion = () => {
    toast.add({ type: "success", title: "Account deleted successfully" });
    queryClient.clear();
    navigate({ to: "/login" });
  };

  const deleteUserCallbacks = {
    onSuccess: () => {
      completeAccountDeletion();
    },
    onError: (authError) => {
      toast.add({
        type: "error",
        title: authError.error.message || "Failed to delete account",
      });
    },
  } satisfies NonNullable<Parameters<typeof authClient.deleteUser>[1]>;

  const form = useForm({
    defaultValues: {
      password: "",
      confirmationPhrase: "",
    },
    onSubmit: async ({ value }) => {
      if (hasCredentialAccount) {
        await authClient.deleteUser({ password: value.password }, deleteUserCallbacks);
      } else {
        await authClient.deleteUser({}, deleteUserCallbacks);
      }
    },
  });
  return (
    <div className="flex flex-col gap-4">
      {isError ? (
        <p className="text-pretty text-sm text-destructive">
          Failed to load account settings: {error?.message}
        </p>
      ) : null}

      <SettingsGroup>
        <SettingsRow
          title="Delete account"
          description="Permanently delete your account and all associated data. This cannot be undone."
        >
          <Dialog>
            <DialogTrigger
              disabled={isTriggerDisabled}
              render={
                <Button variant="destructive" disabled={isTriggerDisabled}>
                  <HugeiconsIcon icon={Delete02Icon} className="size-4" />
                  Delete Account
                </Button>
              }
            />
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Are you absolutely sure?</DialogTitle>
                <DialogDescription>
                  This action cannot be undone. This will permanently delete your account and remove
                  all your data from our servers.
                </DialogDescription>
              </DialogHeader>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  form.handleSubmit();
                }}
                className="flex flex-col gap-4"
              >
                {hasCredentialAccount ? (
                  <form.Field
                    name="password"
                    validators={{
                      onChange: z.string().min(8, "Password must be at least 8 characters"),
                    }}
                  >
                    {(field) => (
                      <div className="flex flex-col gap-2">
                        <Label htmlFor={field.name}>Password</Label>
                        <Input
                          id={field.name}
                          name={field.name}
                          type="password"
                          value={field.state.value}
                          onBlur={field.handleBlur}
                          onChange={(e) => field.handleChange(e.target.value)}
                          placeholder="Enter your password"
                        />
                        <FieldError errors={field.state.meta.errors} />
                      </div>
                    )}
                  </form.Field>
                ) : (
                  <form.Field
                    name="confirmationPhrase"
                    validators={{
                      onChange: z
                        .string()
                        .refine(
                          (val) => val === "delete my account",
                          "Please type 'delete my account' to confirm",
                        ),
                    }}
                  >
                    {(field) => (
                      <div className="flex flex-col gap-2">
                        <Label htmlFor={field.name}>Confirmation</Label>
                        <Input
                          id={field.name}
                          name={field.name}
                          type="text"
                          value={field.state.value}
                          onBlur={field.handleBlur}
                          onChange={(e) => field.handleChange(e.target.value)}
                          placeholder="Type 'delete my account' to confirm"
                        />
                        <p className="text-sm text-muted-foreground">
                          Please type &quot;delete my account&quot; to confirm account deletion.
                        </p>
                        <FieldError errors={field.state.meta.errors} />
                      </div>
                    )}
                  </form.Field>
                )}

                <DialogFooter>
                  <form.Subscribe>
                    {(state) => (
                      <Button
                        type="submit"
                        variant="destructive"
                        disabled={!state.canSubmit || state.isSubmitting}
                      >
                        {state.isSubmitting ? (
                          <>
                            <HugeiconsIcon
                              icon={Loading03Icon}
                              className="mr-2 size-4 animate-spin"
                            />
                            Deleting...
                          </>
                        ) : (
                          "Delete Account Permanently"
                        )}
                      </Button>
                    )}
                  </form.Subscribe>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </SettingsRow>
      </SettingsGroup>
    </div>
  );
}
