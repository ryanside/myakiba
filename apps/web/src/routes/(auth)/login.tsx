import SignInForm from "@/components/auth/sign-in-form";
import { AuthLayout } from "@/components/auth/auth-layout";
import { VerifyEmailView } from "@/components/auth/verify-email-view";
import { createFileRoute, redirect } from "@tanstack/react-router";
import * as z from "zod";
import { resolvePostAuthRedirect } from "@/lib/auth-redirect-url";

const loginSearchSchema = z.object({
  view: z.literal("verify-email").optional(),
  email: z.email().optional(),
  redirect: z.string().optional(),
});

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
  beforeLoad: async ({ context, search }) => {
    const { session } = await context.readSession();
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
        <VerifyEmailView email={email} redirectTo={redirectTo} />
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <SignInForm redirectTo={redirectTo} />
    </AuthLayout>
  );
}
