import { useEffect, useRef } from "react";
import { Add01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import type { ErrorComponentProps } from "@tanstack/react-router";
import { useRead } from "@/data/client";
import { version } from "@/data/resources/version";
import { SessionUnavailable } from "@/components/auth/session-unavailable";
import { RouteError } from "@/components/errors/route-error";
import { AppSidebar } from "@/components/sidebar/app-sidebar";
import { PageBackground } from "@/components/page-background";
import { preparePageBackground } from "@/lib/page-background";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import UserMenu from "@/components/sidebar/user-menu";
import SyncWidget from "@/components/sync/sync-widget";
import SyncStatusWidget from "@/components/sync/sync-status-widget";
import { AppCommand } from "@/components/command/app-command";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { SessionUnavailableError } from "@/lib/session";
import { env } from "@myakiba/env/web";

export const Route = createFileRoute("/(app)")({
  component: RouteComponent,
  errorComponent: AppRouteError,
  beforeLoad: async ({ context, location, cause, matches }) => {
    const { session, unavailable } = await context.readSession();
    if (unavailable) throw new SessionUnavailableError();
    if (!session) {
      throw redirect({
        to: "/login",
        search: {
          redirect: location.pathname,
        },
      });
    }
    if (cause === "preload" || matches.at(-1)?.cause !== "enter") return { session };
    const background = preparePageBackground(location.pathname);
    if (cause === "stay") await afterNextPaint();
    await background;
    return {
      session,
    };
  },
});

function afterNextPaint() {
  if (document.visibilityState === "hidden") return;
  return new Promise<void>((resolve) => {
    const finish = () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      resolve();
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") finish();
    };
    const frame = requestAnimationFrame(() => setTimeout(finish, 0));
    document.addEventListener("visibilitychange", onVisibilityChange);
  });
}

function AppRouteError(props: ErrorComponentProps) {
  if (props.error instanceof SessionUnavailableError) return <SessionUnavailable />;
  return <RouteError {...props} />;
}

function RouteComponent() {
  const hasNotified = useRef(false);
  const { session } = Route.useRouteContext();

  const { data: versionData } = useRead(version.current);

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
          <SidebarInset className="page-background-surface">
            <PageBackground />
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
                      <HugeiconsIcon icon={Add01Icon} data-icon="inline-start" strokeWidth={2} />
                      <span>Add</span>
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
