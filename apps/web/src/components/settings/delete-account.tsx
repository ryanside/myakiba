import { HugeiconsIcon } from "@hugeicons/react";
import { Delete02Icon } from "@hugeicons/core-free-icons";
import { authClient, endSession } from "@/lib/auth-client";
import { toast } from "@/components/ui/toast";
import { useForm } from "@tanstack/react-form";
import { useRead } from "@/data/client";
import { isStaleSignIn, settings } from "@/data/resources/settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusButton, formSubmitStatus, useButtonStatus } from "@/components/ui/status-button";
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
import { useState } from "react";
import * as z from "zod";
import { SettingsRow } from "./settings-row";
import { FreshSignInNotice } from "./sign-in-again";

const CONFIRMATION_PHRASE = "delete my account";

export function DeleteAccount() {
  const { data, isPending, isError } = useRead(settings.accountType);
  const hasCredentialAccount = data?.hasCredentialAccount ?? false;
  const isTriggerDisabled = isPending || isError;
  const [needsFreshSignIn, setNeedsFreshSignIn] = useState(false);
  const { status, run } = useButtonStatus();

  const form = useForm({
    defaultValues: {
      password: "",
      confirmationPhrase: "",
    },
    onSubmit: async ({ value }) => {
      const { error } = await run(
        () =>
          endSession(() =>
            authClient.deleteUser(hasCredentialAccount ? { password: value.password } : {}),
          ),
        (result) => !result.error,
      );
      if (isStaleSignIn(error)) {
        setNeedsFreshSignIn(true);
        return;
      }
      if (error) {
        toast.add({
          type: "error",
          title: error.message || "Couldn't delete account. Try again.",
        });
        return;
      }
      toast.add({ type: "success", title: "Account deleted successfully" });
    },
  });

  return (
    <SettingsRow
      setting="delete-account"
      status={
        isError ? (
          <span className="text-xs text-muted-foreground">Couldn’t check your account</span>
        ) : null
      }
    >
      <Dialog
        onOpenChange={(open) => {
          if (!open) {
            form.reset();
            setNeedsFreshSignIn(false);
          }
        }}
      >
        <DialogTrigger
          disabled={isTriggerDisabled}
          render={
            <Button variant="destructive" disabled={isTriggerDisabled}>
              <HugeiconsIcon icon={Delete02Icon} data-icon="inline-start" />
              Delete Account
            </Button>
          }
        />
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Are you absolutely sure?</DialogTitle>
            <DialogDescription>
              This action cannot be undone. This will permanently delete your account and remove all
              your data from our servers.
            </DialogDescription>
          </DialogHeader>
          {needsFreshSignIn ? (
            <div className="-mx-4 rounded-xl bg-muted/50">
              <FreshSignInNotice
                title="Sign in again to delete your account"
                description="For your security, myakiba deletes an account only within a day of signing in. Nothing was deleted."
              />
            </div>
          ) : (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                event.stopPropagation();
                return form.handleSubmit();
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
                        autoComplete="current-password"
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(event) => field.handleChange(event.target.value)}
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
                        (phrase) => phrase === CONFIRMATION_PHRASE,
                        `Please type '${CONFIRMATION_PHRASE}' to confirm`,
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
                        autoComplete="off"
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(event) => field.handleChange(event.target.value)}
                        placeholder={`Type '${CONFIRMATION_PHRASE}' to confirm`}
                      />
                      <p className="text-sm text-muted-foreground">
                        Please type “{CONFIRMATION_PHRASE}” to confirm account deletion.
                      </p>
                      <FieldError errors={field.state.meta.errors} />
                    </div>
                  )}
                </form.Field>
              )}

              <DialogFooter>
                <form.Subscribe>
                  {(state) => (
                    <StatusButton
                      type="submit"
                      variant="destructive"
                      status={formSubmitStatus(status, state.isSubmitting)}
                      disabled={!state.canSubmit}
                    >
                      Delete Account Permanently
                    </StatusButton>
                  )}
                </form.Subscribe>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </SettingsRow>
  );
}
