import { useEffect, useRef } from "react";
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppSidebar } from "@/components/sidebar/app-sidebar";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import UserMenu from "@/components/sidebar/user-menu";
import SyncStatusWidget from "@/components/sync/sync-status-widget";
import { AppCommand } from "@/components/command/app-command";
import { authClient } from "@/lib/auth-client";
import { getVersion } from "@/queries/version";
import { toast } from "sonner";
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
    refetchInterval: 5 * 60 * 1000,
    refetchIntervalInBackground: false,
    staleTime: 60 * 1000,
  });

  useEffect(() => {
    if (versionData && !hasNotified.current && versionData.buildId !== env.VITE_BUILD_ID) {
      hasNotified.current = true;
      toast.info("A new version is available", {
        description: "Refresh to get the latest updates.",
        duration: Infinity,
        action: {
          label: "Refresh",
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
                <SyncStatusWidget />
                <AppCommand />
              </div>
              <div className="flex items-center gap-2">
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
