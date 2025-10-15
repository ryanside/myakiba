import { createFileRoute, Link } from "@tanstack/react-router";
import { authClient } from "@/lib/auth-client";
import { useForm } from "@tanstack/react-form";
import { z } from "zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Turnstile } from "@marsidev/react-turnstile";
import { ArrowLeft, Loader2, Mail } from "lucide-react";
import { MyAkibaLogo } from "@/components/myakiba-logo";
import { useState } from "react";

export const Route = createFileRoute("/(auth)/forgot-password")({
  component: RouteComponent,
});

function RouteComponent() {
  const [emailSent, setEmailSent] = useState(false);
  const [sentEmail, setSentEmail] = useState("");

  const form = useForm({
    defaultValues: {
      email: "",
      turnstileToken: "",
    },
    onSubmit: async ({ value }) => {
      await handleForgotPassword(value.email, value.turnstileToken);
    },
    validators: {
      onSubmit: z.object({
        email: z.string().email("Invalid email address"),
        turnstileToken: z.string("Captcha is required"),
      }),
    },
  });

  const handleForgotPassword = async (email: string, turnstileToken: string) => {
    const { data, error } = await authClient.requestPasswordReset(
      {
        email: email,
        redirectTo: import.meta.env.PROD
          ? "https://myakiba.app/reset-password"
          : "http://localhost:3001/reset-password",
      },
      {
        headers: {
          "x-captcha-response": turnstileToken,
        },
        onSuccess: () => {
          toast.success("Password reset email sent");
          setSentEmail(email);
          setEmailSent(true);
        },
        onError: (error) => {
          toast.error(
            error.error.message || "Failed to send password reset email"
          );
        },
      }
    );
  };

  if (emailSent) {
    return (
      <div className="bg-background flex min-h-svh flex-col items-center justify-center gap-6 p-6 md:p-10">
        <div className="absolute top-4 left-4">
          <Link to="/">
            <Button variant="ghost" className="text-foreground">
              <ArrowLeft />
              Home
            </Button>
          </Link>
        </div>
        <div className="w-full max-w-md">
          <div className="flex flex-col gap-6">
            <div className="flex flex-col items-center justify-center gap-2">
              <Link to="/">
                <MyAkibaLogo size="full" className="size-28" />
              </Link>
              <div className="text-center">
                <h1 className="text-2xl font-semibold">Check your email</h1>
              </div>
            </div>
            <div className="text-center space-y-4">
              <div className="mx-auto w-12 h-12 bg-green-100 dark:bg-green-900 rounded-full flex items-center justify-center">
                <Mail className="w-6 h-6 text-green-600 dark:text-green-400" />
              </div>
              <p className="text-muted-foreground">
                We've sent a password reset link to <br />
                <span className="font-medium text-foreground">{sentEmail}</span>
              </p>
              <p className="text-sm text-muted-foreground">
                Click the link in the email to reset your password. If you don't see the email, check your spam folder.
              </p>
            </div>
            <div className="text-center text-sm">
              <Link to="/login">
                <Button
                  className="underline underline-offset-4"
                  variant="primary"
                  mode="link"
                >
                  Back to Login
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-background flex min-h-svh flex-col items-center justify-center gap-6 p-6 md:p-10">
      <div className="absolute top-4 left-4">
        <Link to="/">
          <Button variant="ghost" className="text-foreground">
            <ArrowLeft />
            Home
          </Button>
        </Link>
      </div>
      <div className="w-full max-w-md">
        <div className="flex flex-col gap-6">
          <div className="flex flex-col items-center justify-center gap-2">
            <Link to="/">
              <MyAkibaLogo size="full" className="size-28" />
            </Link>
            <div className="text-center">
              <h1 className="text-2xl font-semibold">Forgot your password?</h1>
              <p className="text-sm text-muted-foreground mt-2">
                Enter your email address and we'll send you a link to reset your password.
              </p>
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
            <div>
              <form.Field name="email">
                {(field) => (
                  <div className="space-y-2">
                    <Label htmlFor={field.name}>Email</Label>
                    <Input
                      id={field.name}
                      name={field.name}
                      type="email"
                      placeholder="your@email.com"
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

            <div>
              <form.Field name="turnstileToken">
                {(field) => (
                  <div className="space-y-2">
                    <Turnstile
                      siteKey={import.meta.env.VITE_TURNSTILE_SITE_KEY}
                      onSuccess={field.handleChange}
                    />
                  </div>
                )}
              </form.Field>
            </div>

            <form.Subscribe>
              {(state) => (
                <Button
                  type="submit"
                  className="w-full"
                  disabled={!state.canSubmit || state.isSubmitting}
                >
                  {state.isSubmitting ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    "Send Reset Link"
                  )}
                </Button>
              )}
            </form.Subscribe>
          </form>
          <div className="text-center text-sm">
            Remember your password?{" "}
            <Link to="/login">
              <Button
                className="underline underline-offset-4"
                variant="primary"
                mode="link"
              >
                Back to Login
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
