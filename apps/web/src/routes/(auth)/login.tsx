import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowLeft01Icon } from "@hugeicons/core-free-icons";
import SignInForm from "@/components/auth/sign-in-form";
import SignUpForm from "@/components/auth/sign-up-form";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
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
        <Button variant="link" size="sm" render={<Link to="/" />} nativeButton={false}>
          <HugeiconsIcon
            icon={ArrowLeft01Icon}
            strokeWidth={2}
            data-icon="inline-start"
            aria-hidden="true"
          />
          Back to Home
        </Button>
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
