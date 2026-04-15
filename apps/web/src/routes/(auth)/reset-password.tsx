import { HugeiconsIcon } from "@hugeicons/react";
import { Loading03Icon } from "@hugeicons/core-free-icons";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { authClient } from "@/lib/auth-client";
import { useForm } from "@tanstack/react-form";
import { z } from "zod";
import { toast } from "sonner";
import { BackLink } from "@/components/ui/back-link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MyAkibaLogo } from "@/components/myakiba-logo";
import { AuthLayout } from "@/components/auth/auth-layout";

export const Route = createFileRoute("/(auth)/reset-password")({
  component: RouteComponent,
});

function RouteComponent() {
  const token = new URLSearchParams(window.location.search).get("token");
  const navigate = useNavigate();

  const form = useForm({
    defaultValues: {
      password: "",
      confirm_password: "",
    },
    onSubmit: async ({ value }) => {
      if (!token) {
        toast.error("Invalid token. Please request a new password reset.");
        return;
      }
      await handleResetPassword(value.password);
    },
    validators: {
      onSubmit: z.object({
        password: z.string().min(8, "Password must be at least 8 characters"),
        confirm_password: z.string(),
      }),
    },
  });

  const handleResetPassword = async (password: string) => {
    if (!token) return;

    await authClient.resetPassword(
      {
        newPassword: password,
        token,
      },
      {
        onSuccess: () => {
          toast.success("Password reset successfully");
          navigate({
            to: "/login",
          });
        },
        onError: (error) => {
          toast.error(error.error.message || "Failed to reset password");
        },
      },
    );
  };

  if (!token) {
    return (
      <AuthLayout>
        <div className="flex flex-col gap-6">
          <div
            className="flex flex-col items-center justify-center gap-2 animate-appear"
            style={{ "--appear-delay": "0ms" } as React.CSSProperties}
          >
            <Link to="/">
              <MyAkibaLogo size="full" className="size-28" />
            </Link>
            <div className="text-center">
              <h1 className="text-2xl font-medium">Invalid Reset Link</h1>
            </div>
          </div>
          <div
            className="text-center space-y-4 animate-appear"
            style={{ "--appear-delay": "80ms" } as React.CSSProperties}
          >
            <p className="text-muted-foreground">
              This password reset link is invalid or has expired.
            </p>
            <p className="text-sm text-muted-foreground">
              Please request a new password reset link.
            </p>
          </div>
          <div
            className="flex flex-col gap-2 animate-appear"
            style={{ "--appear-delay": "160ms" } as React.CSSProperties}
          >
            <Link to="/forgot-password">
              <Button
                className="w-full active:scale-[0.97] transition-transform duration-150"
                style={{ transitionTimingFunction: "cubic-bezier(0.23, 1, 0.32, 1)" }}
              >
                Request New Reset Link
              </Button>
            </Link>
            <BackLink to="/login" text="Back to Login" font="sans" className="self-center" />
          </div>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <div className="flex flex-col gap-6">
        <div
          className="flex flex-col items-center justify-center gap-2 animate-appear"
          style={{ "--appear-delay": "0ms" } as React.CSSProperties}
        >
          <Link to="/">
            <MyAkibaLogo size="full" className="size-28" />
          </Link>
          <div className="text-center">
            <h1 className="text-2xl font-medium">Reset your password</h1>
            <p className="text-sm text-muted-foreground mt-2">Enter your new password below.</p>
          </div>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            e.stopPropagation();
            form.handleSubmit();
          }}
          className="grid gap-4"
        >
          <div
            className="animate-appear"
            style={{ "--appear-delay": "80ms" } as React.CSSProperties}
          >
            <form.Field
              name="password"
              validators={{
                onBlur: z.string().min(8, "Password must be at least 8 characters"),
              }}
            >
              {(field) => (
                <div className="space-y-2">
                  <Label htmlFor={field.name}>New Password</Label>
                  <Input
                    id={field.name}
                    name={field.name}
                    type="password"
                    placeholder="Enter new password"
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                  />
                  {field.state.meta.errors.map((error) => (
                    <p key={error?.message} className="text-red-500 text-sm">
                      {error?.message}
                    </p>
                  ))}
                </div>
              )}
            </form.Field>
          </div>

          <div
            className="animate-appear"
            style={{ "--appear-delay": "160ms" } as React.CSSProperties}
          >
            <form.Field
              name="confirm_password"
              validators={{
                onChangeListenTo: ["password"],
                onChange: ({ value, fieldApi }) => {
                  if (value !== fieldApi.form.getFieldValue("password")) {
                    return "Passwords do not match";
                  }
                  return undefined;
                },
                onBlur: ({ value, fieldApi }) => {
                  if (value !== fieldApi.form.getFieldValue("password")) {
                    return "Passwords do not match";
                  }
                  return undefined;
                },
              }}
            >
              {(field) => (
                <div className="space-y-2">
                  <Label htmlFor={field.name}>Confirm Password</Label>
                  <Input
                    id={field.name}
                    name={field.name}
                    type="password"
                    placeholder="Confirm new password"
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                  />
                  {field.state.meta.errors.map((err) => {
                    const errorMessage =
                      typeof err === "string" ? err : err?.message || "Invalid input";
                    return (
                      <p key={errorMessage} className="text-red-500 text-sm">
                        {errorMessage}
                      </p>
                    );
                  })}
                </div>
              )}
            </form.Field>
          </div>

          <div
            className="animate-appear"
            style={{ "--appear-delay": "240ms" } as React.CSSProperties}
          >
            <form.Subscribe>
              {(state) => (
                <Button
                  type="submit"
                  className="w-full active:scale-[0.97] transition-transform duration-150"
                  style={{ transitionTimingFunction: "cubic-bezier(0.23, 1, 0.32, 1)" }}
                  disabled={!state.canSubmit || state.isSubmitting}
                >
                  {state.isSubmitting ? (
                    <HugeiconsIcon icon={Loading03Icon} className="animate-spin" />
                  ) : (
                    "Reset Password"
                  )}
                </Button>
              )}
            </form.Subscribe>
          </div>
        </form>
        <div
          className="text-center text-sm animate-appear"
          style={{ "--appear-delay": "300ms" } as React.CSSProperties}
        >
          Remember your password?{" "}
          <BackLink
            to="/login"
            text="Back to Login"
            font="sans"
            className="inline-flex py-0 mb-0 align-baseline"
          />
        </div>
      </div>
    </AuthLayout>
  );
}
