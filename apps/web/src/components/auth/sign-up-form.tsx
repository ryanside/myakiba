import { HugeiconsIcon } from "@hugeicons/react";
import { Loading03Icon } from "@hugeicons/core-free-icons";
import { authClient } from "@/lib/auth-client";
import { useForm } from "@tanstack/react-form";
import { Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import z from "zod";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Turnstile } from "@marsidev/react-turnstile";
import { MyAkibaLogo } from "../myakiba-logo";
import { env } from "@myakiba/env/web";

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      ></path>
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      ></path>
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      ></path>
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      ></path>
    </svg>
  );
}

export default function SignUpForm({ onSwitchToSignIn }: { onSwitchToSignIn: () => void }) {
  const navigate = useNavigate({
    from: "/",
  });
  const handleGoogleAuth = async () => {
    await authClient.signIn.social(
      {
        provider: "google",
        callbackURL: import.meta.env.PROD ? "/dashboard" : "http://localhost:3001/dashboard",
      },
      {
        onSuccess: () => {
          navigate({
            to: "/dashboard",
          });
        },
        onError: (error) => {
          toast.error(error.error.message || error.error.statusText);
        },
      },
    );
  };

  const form = useForm({
    defaultValues: {
      username: "",
      email: "",
      password: "",
      turnstileToken: "",
    },
    onSubmit: async ({ value }) => {
      await authClient.signUp.email(
        {
          email: value.email,
          password: value.password,
          name: value.username,
          username: value.username,
        },
        {
          headers: {
            "x-captcha-response": value.turnstileToken,
          },
          onSuccess: async () => {
            await authClient.sendVerificationEmail({
              email: value.email,
              callbackURL: import.meta.env.PROD
                ? "https://myakiba.app/sync"
                : "http://localhost:3001/sync",
            });
            navigate({
              to: "/sync",
            });
          },
          onError: (error) => {
            toast.error(error.error.message || error.error.statusText);
          },
        },
      );
    },
    validators: {
      onSubmit: z.object({
        username: z
          .string()
          .min(3, "Username must be at least 3 characters")
          .max(30, "Username must be less than 20 characters"),
        email: z.email("Invalid email address"),
        password: z.string().min(8, "Password must be at least 8 characters"),
        turnstileToken: z.string("Captcha is required"),
      }),
    },
  });

  return (
    <div className="flex flex-col gap-6">
      <div
        className="flex flex-col items-center justify-center gap-2 animate-appear"
        style={{ "--appear-delay": "0ms" } as React.CSSProperties}
      >
        <div className="text-xl font-medium flex items-center gap-2">
          <span>Welcome to</span>
          <MyAkibaLogo size="full" className="size-28 inline-block" />
        </div>
        <div className="text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <button
            type="button"
            onClick={onSwitchToSignIn}
            className="text-foreground underline underline-offset-4 transition-colors duration-150 hover:text-foreground/80"
          >
            Login
          </button>
        </div>
      </div>

      <div className="animate-appear" style={{ "--appear-delay": "60ms" } as React.CSSProperties}>
        <Button
          variant="outline"
          type="button"
          className="w-full active:scale-[0.97] transition-transform duration-150"
          style={{ transitionTimingFunction: "cubic-bezier(0.23, 1, 0.32, 1)" }}
          onClick={handleGoogleAuth}
        >
          <GoogleIcon />
          Continue with Google
        </Button>
      </div>

      <div
        className="after:border-border relative text-center text-sm after:absolute after:inset-0 after:top-1/2 after:z-0 after:flex after:items-center after:border-t animate-appear"
        style={{ "--appear-delay": "120ms" } as React.CSSProperties}
      >
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
        <div
          className="animate-appear"
          style={{ "--appear-delay": "180ms" } as React.CSSProperties}
        >
          <form.Field
            name="username"
            asyncDebounceMs={1000}
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
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                />
                {field.state.meta.errors.map((error) => (
                  <p
                    key={typeof error === "string" ? error : error?.message}
                    className="text-red-500 text-sm"
                  >
                    {typeof error === "string" ? error : error?.message}
                  </p>
                ))}
              </div>
            )}
          </form.Field>
        </div>

        <div
          className="animate-appear"
          style={{ "--appear-delay": "240ms" } as React.CSSProperties}
        >
          <form.Field
            name="email"
            validators={{
              onBlur: z.email("Invalid email address"),
            }}
          >
            {(field) => (
              <div className="space-y-2">
                <Label htmlFor={field.name}>Email</Label>
                <Input
                  id={field.name}
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
        </div>

        <div
          className="animate-appear"
          style={{ "--appear-delay": "300ms" } as React.CSSProperties}
        >
          <form.Field
            name="password"
            validators={{
              onBlur: z.string().min(8, "Password must be at least 8 characters"),
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
                />
                {field.state.meta.errors.map((error) => (
                  <p key={error?.message} className="text-red-500 text-sm">
                    {error?.message}
                  </p>
                ))}
                <div className="flex items-center justify-end">
                  <Link
                    to="/forgot-password"
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors duration-150 underline underline-offset-4"
                  >
                    Forgot password?
                  </Link>
                </div>
              </div>
            )}
          </form.Field>
        </div>

        <div
          className="animate-appear"
          style={{ "--appear-delay": "360ms" } as React.CSSProperties}
        >
          <form.Field name="turnstileToken">
            {(field) => (
              <div className="space-y-2">
                <Turnstile siteKey={env.VITE_TURNSTILE_SITE_KEY} onSuccess={field.handleChange} />
              </div>
            )}
          </form.Field>
        </div>

        <div
          className="animate-appear"
          style={{ "--appear-delay": "420ms" } as React.CSSProperties}
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
                  "Register"
                )}
              </Button>
            )}
          </form.Subscribe>
        </div>
      </form>
    </div>
  );
}
