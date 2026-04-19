import SignInForm from "@/components/auth/sign-in-form";
import SignUpForm from "@/components/auth/sign-up-form";
import { AuthLayout } from "@/components/auth/auth-layout";
import { VerifyEmailView } from "@/components/auth/verify-email-view";
import { authClient } from "@/lib/auth-client";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import * as z from "zod";

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
  beforeLoad: async ({ search }) => {
    if (search.view === "verify-email") {
      return;
    }
    const { data: session } = await authClient.getSession();
    if (session) {
      throw redirect({
        to: "/dashboard",
      });
    }
  },
});

function RouteComponent() {
  const { view, email } = Route.useSearch();
  const [showSignIn, setShowSignIn] = useState(true);

  if (view === "verify-email") {
    return (
      <AuthLayout>
        <VerifyEmailView email={email} />
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      {showSignIn ? (
        <SignInForm onSwitchToSignUp={() => setShowSignIn(false)} />
      ) : (
        <SignUpForm onSwitchToSignIn={() => setShowSignIn(true)} />
      )}
    </AuthLayout>
  );
}
