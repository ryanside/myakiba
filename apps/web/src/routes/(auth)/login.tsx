import SignInForm from "@/components/auth/sign-in-form";
import { AuthLayout } from "@/components/auth/auth-layout";
import { VerifyEmailView } from "@/components/auth/verify-email-view";
import { authClient } from "@/lib/auth-client";
import { createFileRoute, redirect } from "@tanstack/react-router";
import * as z from "zod";

const loginSearchSchema = z.object({
  view: z.literal("verify-email").optional(),
  email: z.email().optional(),
  redirect: z.string().optional(),
});

function resolvePostAuthRedirect(redirectTo: string | undefined): string {
  if (!redirectTo?.startsWith("/") || redirectTo.startsWith("//")) {
    return "/dashboard";
  }

  return redirectTo;
}

export const Route = createFileRoute("/(auth)/login")({
  component: RouteComponent,
  validateSearch: loginSearchSchema,
  head: () => ({
    meta: [
      {
        name: "description",
        content: "login to your myakiba account",
      },
      {
        title: "Login - myakiba",
      },
    ],
  }),
  beforeLoad: async ({ search }) => {
    const { data: session } = await authClient.getSession();
    if (session) {
      throw redirect({
        href: resolvePostAuthRedirect(search.redirect),
      });
    }
  },
});

function RouteComponent() {
  const { view, email, redirect: searchRedirect } = Route.useSearch();
  const redirectTo = resolvePostAuthRedirect(searchRedirect);

  if (view === "verify-email") {
    return (
      <AuthLayout>
        <VerifyEmailView email={email} />
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <SignInForm redirectTo={redirectTo} />
    </AuthLayout>
  );
}
