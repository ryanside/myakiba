import { useEffect, useRef } from "react";
import { Add01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppSidebar } from "@/components/sidebar/app-sidebar";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import UserMenu from "@/components/sidebar/user-menu";
import SyncWidget from "@/components/sync/sync-widget";
import SyncStatusWidget from "@/components/sync/sync-status-widget";
import { AppCommand } from "@/components/command/app-command";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { getVersion } from "@/queries/version";
import { toast } from "@/components/ui/toast";
import { env } from "@myakiba/env/web";

export const Route = createFileRoute("/(app)")({
  component: RouteComponent,
  beforeLoad: async ({ location }) => {
    const { data: session } = await authClient.getSession();
    if (!session) {
      throw redirect({
        to: "/login",
        search: {
          redirect: location.pathname,
        },
      });
    }
    return {
      session,
    };
  },
});

function RouteComponent() {
  const hasNotified = useRef(false);
  const { session } = Route.useRouteContext();

  const { data: versionData } = useQuery({
    queryKey: ["version"],
    queryFn: getVersion,
    refetchOnWindowFocus: true,
    refetchInterval: 60 * 1000,
    refetchIntervalInBackground: false,
    retry: false,
  });

  useEffect(() => {
    if (versionData && !hasNotified.current && versionData.buildId !== env.VITE_BUILD_ID) {
      hasNotified.current = true;
      toast.add({
        type: "info",
        title: "A new version is available",
        description: "Refresh to get the latest updates.",
        timeout: 0,
        actionProps: {
          children: "Refresh",
          onClick: () => window.location.reload(),
        },
      });
    }
  }, [versionData]);

  return (
    <div className="[--header-height:calc(--spacing(14))] max-w-full overflow-x-hidden">
      <SidebarProvider className="flex flex-col">
        <div className="flex min-w-0 max-w-full flex-1 overflow-x-hidden">
          <AppSidebar />
          <SidebarInset>
            <header className="flex h-12 shrink-0 items-center justify-between gap-2 px-4">
              <div className="flex items-center">
                <SidebarTrigger className="-ml-1" />
                <AppCommand />
                <SyncStatusWidget />
              </div>
              <div className="flex items-center gap-2">
                <SyncWidget
                  side="right"
                  TriggerWrapper={
                    <Button variant="default" size="sm">
                      <HugeiconsIcon icon={Add01Icon} strokeWidth={2} />
                      <span>Sync Items</span>
                    </Button>
                  }
                />
                <UserMenu session={session} />
              </div>
            </header>
            <div className="h-full w-full min-w-0 max-w-full overflow-x-hidden p-6">
              <Outlet />
            </div>
          </SidebarInset>
        </div>
      </SidebarProvider>
    </div>
  );
}
