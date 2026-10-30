import SignUpForm from "@/components/auth/sign-up-form";
import { AuthLayout } from "@/components/auth/auth-layout";
import { createFileRoute, redirect } from "@tanstack/react-router";
import * as z from "zod";
import { resolvePostAuthRedirect } from "@/lib/auth-redirect-url";

export const Route = createFileRoute("/(auth)/signup")({
  component: RouteComponent,
  validateSearch: z.object({ redirect: z.string().optional() }),
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
  const { redirect: searchRedirect } = Route.useSearch();
  return (
    <AuthLayout>
      <SignUpForm redirectTo={resolvePostAuthRedirect(searchRedirect)} />
    </AuthLayout>
  );
}
