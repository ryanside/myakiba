import { createFileRoute } from "@tanstack/react-router";
import { DeleteAccount } from "@/components/settings/delete-account";
import { Preferences } from "@/components/settings/preferences";
import { Profile } from "@/components/settings/profile";
import { Account } from "@/components/settings/account";

export const Route = createFileRoute("/(app)/settings")({
  component: RouteComponent,
  head: () => ({
    meta: [
      {
        name: "description",
        content: "your settings",
      },
      {
        title: "Settings - myakiba",
      },
    ],
  }),
});

function RouteComponent() {
  const { session } = Route.useRouteContext();

  return (
    <div className="container max-w-4xl mx-auto space-y-8">
      <div className="flex flex-col gap-2">
        <div className="flex flex-row items-start gap-4">
          <h1 className="text-2xl font-medium tracking-tight">Settings</h1>
        </div>
      </div>

      <div className="space-y-6">
        <Preferences user={session.user} />
        <Profile user={session.user} />
        <Account />
        <DeleteAccount />
      </div>
    </div>
  );
}
