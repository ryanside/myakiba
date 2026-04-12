import SignInForm from "@/components/auth/sign-in-form";
import SignUpForm from "@/components/auth/sign-up-form";
import { BackLink } from "@/components/ui/back-link";
import { authClient } from "@/lib/auth-client";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";

export const Route = createFileRoute("/(auth)/login")({
  component: RouteComponent,
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
  beforeLoad: async () => {
    const { data: session } = await authClient.getSession();
    if (session) {
      throw redirect({
        to: "/dashboard",
      });
    }
  },
});

function RouteComponent() {
  const [showSignIn, setShowSignIn] = useState(true);

  return (
    <div className="bg-background flex min-h-svh flex-col items-center justify-center gap-6 p-6 md:p-10">
      <div className="absolute top-4 left-4">
        <BackLink to="/" text="Back to Home" font="sans" />
      </div>
      <div className="w-full max-w-md">
        {showSignIn ? (
          <SignInForm onSwitchToSignUp={() => setShowSignIn(false)} />
        ) : (
          <SignUpForm onSwitchToSignIn={() => setShowSignIn(true)} />
        )}
      </div>
    </div>
  );
}
