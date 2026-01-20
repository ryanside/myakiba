import {
  createFileRoute,
  type UseNavigateResult,
} from "@tanstack/react-router";
import { authClient } from "@/lib/auth-client";
import { toast } from "sonner";
import { useNavigate } from "@tanstack/react-router";
import { useForm } from "@tanstack/react-form";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Loader2, Trash2 } from "lucide-react";
import * as z from "zod";
import { MaskInput } from "@/components/ui/mask-input";
import { getCurrencyLocale } from "@myakiba/utils";
import { app } from "@/lib/treaty-client";
import { clearRecentItems } from "@/lib/recent-items";

interface Budget {
  id: string;
  userId: string;
  period: "monthly" | "annual" | "allocated";
  amount: string;
  createdAt: Date;
  updatedAt: Date;
}

type User = {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  email: string;
  emailVerified: boolean;
  name: string;
  image?: string | null | undefined;
  username?: string | null | undefined;
  displayUsername?: string | null | undefined;
  currency: string | null | undefined;
};

export const Route = createFileRoute("/(app)/settings")({
  component: RouteComponent,
  head: () => ({
    meta: [
      {
        name: "description",
        content: "your settings",
      },
      {
        title: "Settings - myakiba",
      },
    ],
  }),
});

function RouteComponent() {
  const navigate = useNavigate();
  const { session } = Route.useRouteContext();

  const {
    data: budgetData,
    isPending: isBudgetPending,
    isError: isBudgetError,
  } = useQuery({
    queryKey: ["settings"],
    queryFn: async () => {
      const { data, error } = await app.api.settings.get();
      if (error) {
        throw new Error(error.value || "Failed to get settings");
      }
      return data;
    },
    staleTime: 1000 * 60 * 5,
    retry: false,
  });

  const {
    data: accountTypeData,
    isPending: isAccountTypePending,
    isError: isAccountTypeError,
  } = useQuery({
    queryKey: ["account-type"],
    queryFn: async () => {
      const { data, error } = await app.api.settings["account-type"].get();
      if (error) {
        throw new Error(error.value || "Failed to get account type");
      }
      return data;
    },
    staleTime: 1000 * 60 * 5,
    retry: false,
  });

  if (isBudgetPending || isAccountTypePending) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="animate-spin" />
      </div>
    );
  }

  if (isBudgetError || isAccountTypeError) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-destructive">Failed to load settings</p>
      </div>
    );
  }

  const hasCredentialAccount = accountTypeData.hasCredentialAccount;

  return (
    <div className="container max-w-4xl mx-auto py-8 space-y-8">
      <div className="flex flex-col gap-2">
        <div className="flex flex-row items-start gap-4">
          <h1 className="text-2xl tracking-tight">Settings</h1>
        </div>
        <p className="text-muted-foreground text-sm font-light">
          Manage your settings and preferences.
        </p>
      </div>

      <div className="space-y-6">
        <BudgetForm user={session.user} budget={budgetData.budget} />
        <PreferencesForm user={session.user} />
        <ProfileForm user={session.user} />
        {hasCredentialAccount && <PasswordForm />}
        <DeleteAccountForm
          navigate={navigate}
          hasCredentialAccount={hasCredentialAccount}
        />
      </div>
    </div>
  );
}

function BudgetForm({ user, budget }: { user: User; budget: Budget }) {
  const queryClient = useQueryClient();

  const upsertBudgetMutation = useMutation({
    mutationFn: async ({
      amount,
      period,
    }: {
      amount: number;
      period: "monthly" | "annual" | "allocated";
    }) => {
      const { data, error } = await app.api.settings.put({
        amount,
        period,
      });
      if (error) {
        if (error.status === 422) {
          throw new Error(error.value.message || "Failed to update budget");
        }
        throw new Error(error.value || "Failed to update budget");
      }
      return data;
    },
    onError: (error) => {
      toast.error("Failed to update budget", {
        description: `Error: ${error.message}`,
      });
    },
    onSuccess: async () => {
      toast.success("Budget updated successfully");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["settings"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
      ]);
    },
  });

  const deleteBudgetMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await app.api.settings.delete();
      if (error) {
        throw new Error(error.value || "Failed to delete budget");
      }
      return data;
    },
    onError: (error) => {
      toast.error("Failed to delete budget", {
        description: `Error: ${error.message}`,
      });
    },
    onSuccess: async () => {
      toast.success("Budget deleted successfully");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["settings"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
      ]);
    },
  });

  const form = useForm({
    defaultValues: {
      amount: budget?.amount || "0",
      period: (budget?.period || "monthly") as
        | "monthly"
        | "annual"
        | "allocated",
    },
    onSubmit: async ({ value }) => {
      upsertBudgetMutation.mutate({
        amount: parseFloat(value.amount),
        period: value.period,
      });
    },
    validators: {
      onSubmit: z.object({
        amount: z.string().refine((val) => {
          const num = parseFloat(val);
          return !isNaN(num) && num >= 0;
        }, "Amount must be at least 0"),
        period: z.enum(["monthly", "annual", "allocated"]),
      }),
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-medium">Budget</CardTitle>
        <CardDescription>Set your budget limit</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            e.stopPropagation();
            form.handleSubmit();
          }}
          className="space-y-4"
        >
          <form.Field name="amount">
            {(field) => (
              <div className="space-y-2">
                <Label htmlFor={field.name}>Budget Limit</Label>
                <MaskInput
                  id={field.name}
                  name={field.name}
                  mask="currency"
                  currency={user.currency ?? "USD"}
                  locale={getCurrencyLocale(user.currency ?? "USD")}
                  value={field.state.value}
                  onValueChange={(_, unmaskedValue) =>
                    field.handleChange(unmaskedValue)
                  }
                />
                {field.state.meta.errors.length > 0 && (
                  <p className="text-sm text-destructive">
                    {String(field.state.meta.errors[0])}
                  </p>
                )}
              </div>
            )}
          </form.Field>
          <form.Field name="period">
            {(field) => (
              <div className="space-y-2">
                <Label htmlFor={field.name}>Period</Label>
                <Select
                  value={field.state.value}
                  onValueChange={(value) =>
                    field.handleChange(
                      value as "monthly" | "annual" | "allocated"
                    )
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder={field.state.value} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="annual">Annual</SelectItem>
                    <SelectItem value="allocated">Allocated</SelectItem>
                  </SelectContent>
                </Select>
                {field.state.meta.errors.length > 0 && (
                  <p className="text-sm text-destructive">
                    {String(field.state.meta.errors[0])}
                  </p>
                )}
              </div>
            )}
          </form.Field>
          <div className="flex flex-row gap-2">
            <form.Subscribe>
              {(state) => (
                <Button
                  type="submit"
                  disabled={!state.canSubmit || state.isSubmitting}
                >
                  {state.isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    "Save Changes"
                  )}
                </Button>
              )}
            </form.Subscribe>
            <Button
              variant="ghost"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                deleteBudgetMutation.mutate();
                form.reset();
              }}
            >
              Clear Budget
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function ProfileForm({ user }: { user: User }) {
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

      toast.success("Profile updated successfully");
      return;
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
    <Card>
      <CardHeader>
        <CardTitle className="font-medium">Profile Information</CardTitle>
        <CardDescription>
          Update your profile information and display name
        </CardDescription>
      </CardHeader>
      <CardContent>
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
            validators={{
              onChangeAsync: async ({ value }) => {
                if (value.length < 3) {
                  return;
                } else if (value.length > 30) {
                  return;
                } else {
                  const { data, error } = await authClient.isUsernameAvailable({
                    username: value,
                  });
                  if (data?.available === false) {
                    return "Username is already taken";
                  }
                  if (error) {
                    return error.message;
                  }
                }
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
                {field.state.meta.errors.map((error) => (
                  <p
                    key={typeof error === "string" ? error : error?.message}
                    className="text-destructive"
                  >
                    {typeof error === "string" ? error : error?.message}
                  </p>
                ))}
              </div>
            )}
          </form.Field>

          <form.Subscribe>
            {(state) => (
              <Button
                type="submit"
                disabled={!state.canSubmit || state.isSubmitting}
              >
                {state.isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save Changes"
                )}
              </Button>
            )}
          </form.Subscribe>
        </form>
      </CardContent>
    </Card>
  );
}

function PasswordForm() {
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
          onError: (error) => {
            toast.error(error.error.message || "Failed to change password");
          },
        }
      );
    },
    validators: {
      onSubmit: z.object({
        currentPassword: z
          .string()
          .min(8, "Password must be at least 8 characters"),
        newPassword: z
          .string()
          .min(8, "Password must be at least 8 characters"),
        confirmPassword: z
          .string()
          .min(8, "Password must be at least 8 characters"),
      }),
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-medium">Change Password</CardTitle>
        <CardDescription>
          Update your password to keep your account secure
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            e.stopPropagation();
            form.handleSubmit();
          }}
          className="space-y-4"
        >
          <form.Field name="currentPassword">
            {(field) => (
              <div className="space-y-2">
                <Label htmlFor={field.name}>Current Password</Label>
                <Input
                  id={field.name}
                  name={field.name}
                  type="password"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                  placeholder="Enter current password"
                />
                {field.state.meta.errors.length > 0 && (
                  <p className="text-sm text-destructive">
                    {field.state.meta.errors[0]?.message}
                  </p>
                )}
              </div>
            )}
          </form.Field>

          <form.Field name="newPassword">
            {(field) => (
              <div className="space-y-2">
                <Label htmlFor={field.name}>New Password</Label>
                <Input
                  id={field.name}
                  name={field.name}
                  type="password"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                  placeholder="Enter new password"
                />
                {field.state.meta.errors.length > 0 && (
                  <p className="text-sm text-destructive">
                    {field.state.meta.errors[0]?.message}
                  </p>
                )}
              </div>
            )}
          </form.Field>

          <form.Field name="confirmPassword">
            {(field) => (
              <div className="space-y-2">
                <Label htmlFor={field.name}>Confirm New Password</Label>
                <Input
                  id={field.name}
                  name={field.name}
                  type="password"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                  placeholder="Confirm new password"
                />
                {field.state.meta.errors.length > 0 && (
                  <p className="text-sm text-destructive">
                    {field.state.meta.errors[0]?.message}
                  </p>
                )}
              </div>
            )}
          </form.Field>

          <form.Subscribe>
            {(state) => (
              <Button
                type="submit"
                disabled={!state.canSubmit || state.isSubmitting}
              >
                {state.isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Changing...
                  </>
                ) : (
                  "Change Password"
                )}
              </Button>
            )}
          </form.Subscribe>
        </form>
      </CardContent>
    </Card>
  );
}

function PreferencesForm({ user }: { user: User }) {
  const form = useForm({
    defaultValues: {
      currency: user.currency || "USD",
    },
    onSubmit: async ({ value }) => {
      const { error } = await authClient.updateUser({
        currency: value.currency,
      });

      if (error) {
        toast.error(error.message || "Failed to update preferences");
        return;
      }

      toast.success("Preferences updated successfully");
    },
    validators: {
      onSubmit: z.object({
        currency: z.string().min(1, "Currency is required"),
      }),
    },
  });

  const currencies = [
    { value: "USD", label: "USD - US Dollar" },
    { value: "EUR", label: "EUR - Euro" },
    { value: "GBP", label: "GBP - British Pound" },
    { value: "JPY", label: "JPY - Japanese Yen" },
    { value: "CNY", label: "CNY - Chinese Yuan" },
    { value: "CAD", label: "CAD - Canadian Dollar" },
    { value: "AUD", label: "AUD - Australian Dollar" },
    { value: "NZD", label: "NZD - New Zealand Dollar" },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-medium">Preferences</CardTitle>
        <CardDescription>
          Customize your application preferences
        </CardDescription>
      </CardHeader>
      <CardContent>
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
              <div className="space-y-2">
                <Label htmlFor={field.name}>Display Currency</Label>
                <Select
                  value={field.state.value}
                  onValueChange={(value) => field.handleChange(value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={field.state.value} />
                  </SelectTrigger>
                  <SelectContent>
                    {currencies.map((currency) => (
                      <SelectItem key={currency.value} value={currency.value}>
                        {currency.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-sm text-muted-foreground">
                  Choose your preferred currency for displaying and inputting
                  prices
                </p>
                {field.state.meta.errors.length > 0 && (
                  <p className="text-sm text-destructive">
                    {field.state.meta.errors[0]?.message}
                  </p>
                )}
              </div>
            )}
          </form.Field>

          <form.Subscribe>
            {(state) => (
              <Button
                type="submit"
                disabled={!state.canSubmit || state.isSubmitting}
              >
                {state.isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save Preferences"
                )}
              </Button>
            )}
          </form.Subscribe>
        </form>
      </CardContent>
    </Card>
  );
}

function DeleteAccountForm({
  navigate,
  hasCredentialAccount,
}: {
  navigate: UseNavigateResult<string>;
  hasCredentialAccount: boolean;
}) {
  const queryClient = useQueryClient();

  const deleteAccountMutation = useMutation({
    mutationFn: async (confirmationPhrase: string) => {
      const { data, error } = await app.api.settings.account.delete({
        confirmationPhrase,
      });
      if (error) {
        if (error.status === 422) {
          throw new Error(error.value.message || "Failed to delete account");
        }
        throw new Error(error.value || "Failed to delete account");
      }
      return data;
    },
    onSuccess: async () => {
      toast.success("Account deleted successfully");
      await authClient.signOut({
        fetchOptions: {
          onSuccess: () => {
            // Clear all React Query cache
            queryClient.clear();
            clearRecentItems();
            navigate({
              to: "/login",
            });
          },
        },
      });
    },
    onError: (error) => {
      toast.error(error.message || "Failed to delete account");
    },
  });

  const form = useForm({
    defaultValues: {
      password: "",
      confirmationPhrase: "",
    },
    onSubmit: async ({ value }) => {
      if (hasCredentialAccount) {
        await authClient.deleteUser(
          {
            password: value.password,
          },
          {
            onSuccess: async () => {
              toast.success("Account deleted successfully");
              await authClient.signOut({
                fetchOptions: {
                  onSuccess: () => {
                    // Clear all React Query cache
                    queryClient.clear();
                    clearRecentItems();
                    navigate({
                      to: "/login",
                    });
                  },
                },
              });
            },
            onError: (error) => {
              toast.error(error.error.message || "Failed to delete account");
            },
          }
        );
      } else {
        deleteAccountMutation.mutate(value.confirmationPhrase);
      }
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-medium">Delete Account</CardTitle>
        <CardDescription>
          Permanently delete your account and remove all your data from our
          servers
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="destructive">
              <Trash2 className="mr-2 h-4 w-4" />
              Delete Account
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Are you absolutely sure?</DialogTitle>
              <DialogDescription>
                This action cannot be undone. This will permanently delete your
                account and remove all your data from our servers.
              </DialogDescription>
            </DialogHeader>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                e.stopPropagation();
                form.handleSubmit();
              }}
              className="space-y-4"
            >
              {hasCredentialAccount ? (
                <form.Field
                  name="password"
                  validators={{
                    onChange: z
                      .string()
                      .min(8, "Password must be at least 8 characters"),
                  }}
                >
                  {(field) => (
                    <div className="space-y-2">
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
                      {field.state.meta.errors.length > 0 && (
                        <p className="text-sm text-destructive">
                          {field.state.meta.errors[0]?.message}
                        </p>
                      )}
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
                        "Please type 'delete my account' to confirm"
                      ),
                  }}
                >
                  {(field) => (
                    <div className="space-y-2">
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
                        Please type &quot;delete my account&quot; to confirm
                        account deletion.
                      </p>
                      {field.state.meta.errors.length > 0 && (
                        <p className="text-sm text-destructive">
                          {field.state.meta.errors[0]?.message}
                        </p>
                      )}
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
                      disabled={
                        !state.canSubmit ||
                        state.isSubmitting ||
                        deleteAccountMutation.isPending
                      }
                    >
                      {state.isSubmitting || deleteAccountMutation.isPending ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
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
      </CardContent>
    </Card>
  );
}
