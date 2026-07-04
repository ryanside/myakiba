import { HugeiconsIcon } from "@hugeicons/react";
import { Loading03Icon } from "@hugeicons/core-free-icons";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getAccountType } from "@/queries/settings";
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

  const {
    data: accountTypeData,
    isPending: isAccountTypePending,
    isError: isAccountTypeError,
    error: accountTypeError,
  } = useQuery({
    queryKey: ["account-type"],
    queryFn: getAccountType,
    staleTime: 1000 * 60 * 5,
    retry: false,
  });

  if (isAccountTypePending) {
    return (
      <div className="flex items-center justify-center h-full">
        <HugeiconsIcon icon={Loading03Icon} className="animate-spin" />
      </div>
    );
  }

  if (isAccountTypeError) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-destructive">Failed to load settings: {accountTypeError?.message}</p>
      </div>
    );
  }

  const hasCredentialAccount = accountTypeData.hasCredentialAccount;

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
        {hasCredentialAccount && <Account />}
        <DeleteAccount hasCredentialAccount={hasCredentialAccount} />
      </div>
    </div>
  );
}
