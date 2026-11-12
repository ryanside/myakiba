import { authClient, decodeAuth } from "@/lib/auth-client";
import { useForm } from "@tanstack/react-form";
import { Link } from "@tanstack/react-router";
import { toast } from "@/components/ui/toast";
import { z } from "zod";
import { Button } from "../ui/button";
import { StatusButton, formSubmitStatus, useButtonStatus } from "../ui/status-button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Captcha, useCaptcha } from "@/components/auth/captcha";
import { GoogleIcon } from "@/components/auth/google-icon";
import { MyAkibaLogo } from "../myakiba-logo";
import { PasswordInput } from "@/components/auth/password-input";
import { getAuthRedirectUrl } from "@/lib/auth-redirect-url";
import { formSubmitHandler } from "@/lib/form-submit";

export default function SignInForm({ redirectTo }: { redirectTo: string }) {
  const handleGoogleAuth = async () => {
    const started = await decodeAuth(() =>
      authClient.signIn.social({
        provider: "google",
        callbackURL: getAuthRedirectUrl(redirectTo),
      }),
    );
    if (started.isErr()) {
      toast.add({ type: "error", title: started.error.message || started.error.statusText });
    }
  };

  const { status, run } = useButtonStatus();
  const captcha = useCaptcha();
  const form = useForm({
    defaultValues: {
      email: "",
      password: "",
    },
    onSubmit: async ({ value }) => {
      const captchaToken = await captcha.token();
      if (captchaToken === null) return;
      const signedIn = await run(
        () =>
          decodeAuth(() =>
            authClient.signIn.email(
              {
                email: value.email,
                password: value.password,
                callbackURL: getAuthRedirectUrl(redirectTo),
              },
              { headers: { "x-captcha-response": captchaToken } },
            ),
          ),
        (result) => result.isOk(),
      );
      if (signedIn.isErr()) {
        toast.add({
          type: "error",
          title:
            signedIn.error.status === 403
              ? "Please verify your email address. Check your inbox for a verification email."
              : signedIn.error.message || signedIn.error.statusText,
        });
        return;
      }
      window.location.assign(getAuthRedirectUrl(redirectTo));
    },
    validators: {
      onSubmit: z.object({
        email: z.email({ error: "Invalid email address" }),
        password: z.string().min(8, "Password must be at least 8 characters"),
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
            <Link
              to="/signup"
              search={{ redirect: redirectTo }}
              className="font-medium text-foreground underline underline-offset-4"
            >
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

      <form onSubmit={formSubmitHandler(form)} className="grid gap-4">
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

        <Captcha captcha={captcha} />

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
