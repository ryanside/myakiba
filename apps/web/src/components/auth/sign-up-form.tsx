import { authClient, decodeAuth } from "@/lib/auth-client";
import { useForm } from "@tanstack/react-form";
import { Link, useNavigate } from "@tanstack/react-router";
import { toast } from "@/components/ui/toast";
import { z } from "zod";
import { Button } from "../ui/button";
import { StatusButton, formSubmitStatus, useButtonStatus } from "../ui/status-button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { FieldError } from "../ui/field";
import { Captcha, useCaptcha } from "@/components/auth/captcha";
import { GoogleIcon } from "@/components/auth/google-icon";
import { MyAkibaLogo } from "../myakiba-logo";
import { PasswordInput } from "@/components/auth/password-input";
import { getAuthRedirectUrl } from "@/lib/auth-redirect-url";
import { formSubmitHandler } from "@/lib/form-submit";

export default function SignUpForm({ redirectTo = "/dashboard" }: { redirectTo?: string }) {
  const navigate = useNavigate();

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
      username: "",
      email: "",
      password: "",
    },
    onSubmit: async ({ value }) => {
      const captchaToken = await captcha.token();
      if (captchaToken === null) return;
      const signedUp = await run(
        () =>
          decodeAuth(() =>
            authClient.signUp.email(
              {
                email: value.email,
                password: value.password,
                name: value.username,
                username: value.username,
                callbackURL: getAuthRedirectUrl(redirectTo),
              },
              { headers: { "x-captcha-response": captchaToken } },
            ),
          ),
        (result) => result.isOk(),
      );
      if (signedUp.isErr()) {
        toast.add({ type: "error", title: signedUp.error.message || signedUp.error.statusText });
        return;
      }
      navigate({
        to: "/login",
        search: { view: "verify-email", email: value.email, redirect: redirectTo },
      });
    },
    validators: {
      onSubmit: z.object({
        username: z
          .string()
          .min(3, "Username must be at least 3 characters")
          .max(30, "Username must be less than 30 characters"),
        email: z.email({ error: "Invalid email address" }),
        password: z.string().min(8, "Password must be at least 8 characters"),
      }),
    },
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-6">
        <MyAkibaLogo size="full" className="my-0 h-5 w-[6.5rem]" />
        <div className="flex flex-col gap-1">
          <h1 className="text-[1.375rem] leading-8 font-medium tracking-tight">
            Create your account
          </h1>
          <p className="text-[0.9375rem] text-muted-foreground">
            Already have one?{" "}
            <Link
              to="/login"
              search={{ redirect: redirectTo }}
              className="font-medium text-foreground underline underline-offset-4"
            >
              Sign in
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
        <form.Field
          name="username"
          asyncDebounceMs={1000}
          validators={{
            onChangeAsync: async ({ value }) => {
              if (value.length < 3) {
                return;
              } else if (value.length > 30) {
                return;
              }
              const checked = await decodeAuth(() =>
                authClient.isUsernameAvailable({ username: value }),
              );
              if (checked.isErr()) {
                return checked.error.message;
              }
              if (checked.value.available === false) {
                return "Username is already taken";
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
                className="h-10"
                name={field.name}
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
              />
              <FieldError className="text-red-500 text-sm" errors={field.state.meta.errors} />
            </div>
          )}
        </form.Field>

        <form.Field
          name="email"
          validators={{
            onBlur: z.email({ error: "Invalid email address" }),
          }}
        >
          {(field) => (
            <div className="space-y-2">
              <Label htmlFor={field.name}>Email</Label>
              <Input
                id={field.name}
                className="h-10"
                name={field.name}
                type="email"
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

        <form.Field
          name="password"
          validators={{
            onBlur: z.string().min(8, "Password must be at least 8 characters"),
          }}
        >
          {(field) => (
            <div className="space-y-2">
              <Label htmlFor={field.name}>Password</Label>
              <PasswordInput
                id={field.name}
                name={field.name}
                autoComplete="new-password"
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
              />
              {field.state.meta.errors.map((error) => (
                <p key={error?.message} className="text-red-500 text-sm">
                  {error?.message}
                </p>
              ))}
              <div className="flex items-center justify-end">
                <Link to="/forgot-password" className="text-sm text-muted-foreground underline">
                  Forgot password?
                </Link>
              </div>
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
              Register
            </StatusButton>
          )}
        </form.Subscribe>
      </form>
    </div>
  );
}
