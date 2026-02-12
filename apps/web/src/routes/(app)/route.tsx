import { useEffect, useRef } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppSidebar } from "@/components/sidebar/app-sidebar";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Outlet, redirect, useLocation } from "@tanstack/react-router";
import UserMenu from "@/components/sidebar/user-menu";
import SyncWidget from "@/components/sync/sync-widget";
import { authClient } from "@/lib/auth-client";
import { SearchCommand } from "@/components/sidebar/search-command";
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
  const location = useLocation();

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
    <div className="[--header-height:calc(--spacing(14))]">
      <SidebarProvider className="flex flex-col">
        <div className="flex flex-1">
          <AppSidebar />
          <SidebarInset className="shadow-none! border-border">
            <header className="flex h-12 shrink-0 items-center justify-between gap-2 px-4">
              <div className="flex items-center gap-0.5">
                <SidebarTrigger className="-ml-1" />
                <span className="text-sm font-medium">{location.pathname}</span>
              </div>
              <div className="flex items-center gap-4">
                <SearchCommand />
                <SyncWidget session={session} />
                <UserMenu session={session} />
              </div>
            </header>
            <div className="h-full w-full p-6">
              <Outlet />
            </div>
          </SidebarInset>
        </div>
      </SidebarProvider>
    </div>
  );
}
