import { authClient } from "@/lib/auth-client";
import { useForm } from "@tanstack/react-form";
import { Link } from "@tanstack/react-router";
import { toast } from "@/components/ui/toast";
import { z } from "zod";
import { Button } from "../ui/button";
import { StatusButton, formSubmitStatus, useButtonStatus } from "../ui/status-button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Captcha } from "@/components/auth/captcha";
import { MyAkibaLogo } from "../myakiba-logo";
import { PasswordInput } from "@/components/auth/password-input";
import { getAuthRedirectUrl } from "@/lib/auth-redirect-url";

function GoogleIcon() {
  return (
    <svg data-icon="inline-start" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

export default function SignInForm({ redirectTo }: { redirectTo: string }) {
  const handleGoogleAuth = async () => {
    await authClient.signIn.social(
      {
        provider: "google",
        callbackURL: getAuthRedirectUrl(redirectTo),
      },
      {
        onError: (error) => {
          toast.add({
            type: "error",
            title: error.error.message || error.error.statusText,
          });
        },
      },
    );
  };

  const { status, run } = useButtonStatus();
  const form = useForm({
    defaultValues: {
      email: "",
      password: "",
      turnstileToken: "",
    },
    onSubmit: async ({ value }) => {
      await run(
        () =>
          authClient.signIn.email(
            {
              email: value.email,
              password: value.password,
            },
            {
              headers: {
                "x-captcha-response": value.turnstileToken,
              },
              onSuccess: () => {
                window.location.assign(getAuthRedirectUrl(redirectTo));
              },
              onError: (error) => {
                if (error.error.status === 403) {
                  toast.add({
                    type: "error",
                    title:
                      "Please verify your email address. Check your inbox for a verification email.",
                  });
                  return;
                }
                toast.add({
                  type: "error",
                  title: error.error.message || error.error.statusText,
                });
              },
            },
          ),
        (result) => !result.error,
      );
    },
    validators: {
      onSubmit: z.object({
        email: z.email({ error: "Invalid email address" }),
        password: z.string().min(8, "Password must be at least 8 characters"),
        turnstileToken: z.string({ error: "Captcha is required" }),
      }),
    },
  });

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-6">
        <MyAkibaLogo size="full" className="my-0 h-5 w-[6.5rem]" />
        <div className="flex flex-col gap-1">
          <h1 className="text-[1.375rem] leading-8 font-medium tracking-tight">Sign in</h1>
          <p className="text-[0.9375rem] text-muted-foreground">
            New to myakiba?{" "}
            <Link to="/signup" className="font-medium text-foreground underline underline-offset-4">
              Create an account
            </Link>
          </p>
        </div>
      </div>

      <Button
        variant="outline"
        size="lg"
        type="button"
        className="w-full"
        onClick={handleGoogleAuth}
      >
        <GoogleIcon />
        Continue with Google
      </Button>

      <div className="after:border-border relative text-center text-sm after:absolute after:inset-0 after:top-1/2 after:z-0 after:flex after:items-center after:border-t">
        <span className="bg-background text-muted-foreground relative z-10 px-2">or</span>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          e.stopPropagation();
          form.handleSubmit();
        }}
        className="grid gap-4"
      >
        <form.Field name="email">
          {(field) => (
            <div className="space-y-2">
              <Label htmlFor={field.name}>Email</Label>
              <Input
                id={field.name}
                className="h-10"
                name={field.name}
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
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

        <form.Field name="password">
          {(field) => (
            <div className="space-y-2">
              <div className="flex items-baseline justify-between gap-2">
                <Label htmlFor={field.name}>Password</Label>
                <Link
                  to="/forgot-password"
                  className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                >
                  Forgot password?
                </Link>
              </div>
              <PasswordInput
                id={field.name}
                name={field.name}
                autoComplete="current-password"
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

        <form.Field name="turnstileToken">
          {(field) => (
            <div className="space-y-2">
              <Captcha onSuccess={field.handleChange} />
            </div>
          )}
        </form.Field>

        <form.Subscribe>
          {(state) => (
            <StatusButton
              type="submit"
              size="lg"
              className="w-full"
              status={formSubmitStatus(status, state.isSubmitting)}
              disabled={!state.canSubmit}
            >
              Sign in
            </StatusButton>
          )}
        </form.Subscribe>
      </form>
    </div>
  );
}
