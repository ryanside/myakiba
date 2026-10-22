import SignUpForm from "@/components/auth/sign-up-form";
import { AuthLayout } from "@/components/auth/auth-layout";
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/(auth)/signup")({
  component: RouteComponent,
  head: () => ({
    meta: [
      {
        name: "description",
        content: "create your myakiba account",
      },
      {
        title: "Sign up - myakiba",
      },
    ],
  }),
  beforeLoad: async ({ context }) => {
    const { session } = await context.readSession();
    if (session) {
      throw redirect({
        to: "/dashboard",
      });
    }
  },
});

function RouteComponent() {
  return (
    <AuthLayout>
      <SignUpForm />
    </AuthLayout>
  );
}
