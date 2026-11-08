import { useEffect, useRef } from "react";
import { Add01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { createFileRoute, Link, Outlet, redirect } from "@tanstack/react-router";
import type { ErrorComponentProps } from "@tanstack/react-router";
import { useRead } from "@/data/client";
import { version } from "@/data/resources/version";
import { SessionUnavailable as SessionUnavailableView } from "@/components/auth/session-unavailable";
import { RouteError } from "@/components/errors/route-error";
import { AppSidebar } from "@/components/sidebar/app-sidebar";
import { OnboardingProvider } from "@/components/onboarding/onboarding-dialog";
import { PageBackground } from "@/components/page-background";
import { preparePageBackground } from "@/lib/page-background";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import UserMenu from "@/components/sidebar/user-menu";
import { ExtensionPromptPopover } from "@/components/extension/extension-prompt-popover";
import { AppCommand } from "@/components/command/app-command";
import { ExtensionRequiredDialog } from "@/components/extension/extension-required-dialog";
import { buttonVariants } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { SessionUnavailable } from "@/lib/errors/session-unavailable";
import { env } from "@myakiba/env/web";

export const Route = createFileRoute("/(app)")({
  component: RouteComponent,
  errorComponent: AppRouteError,
  beforeLoad: async ({ context, location, cause, matches }) => {
    const { session, unavailable } = await context.readSession();
    // TanStack Router reads a failed beforeLoad only from a throw, and AppRouteError shows it.
    if (unavailable) throw new SessionUnavailable();
    if (!session) {
      throw redirect({
        to: "/login",
        search: {
          redirect: location.href,
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
  if (SessionUnavailable.is(props.error)) return <SessionUnavailableView />;
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
    <div className="[--header-height:calc(--spacing(14))] w-full min-w-0 max-w-full overflow-x-clip">
      <a
        href="#main-content"
        className="sr-only z-50 rounded-full bg-primary px-4 py-2 text-sm text-primary-foreground focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>
      <OnboardingProvider>
        <SidebarProvider className="flex flex-col" defaultOpen>
          <div className="flex min-w-0 max-w-full flex-1 overflow-x-clip">
            <AppSidebar />
            <SidebarInset tabIndex={-1} className="page-background-surface outline-none">
              <PageBackground />
              <header className="flex h-14 shrink-0 items-center justify-between gap-3 px-4 md:px-8">
                <div className="flex min-w-0 items-center gap-2">
                  <SidebarTrigger className="-ml-1" />
                  <AppCommand />
                  <ExtensionPromptPopover />
                </div>
                <div className="flex items-center gap-2">
                  <Link to="/add" className={buttonVariants({ size: "icon" })} aria-label="Add">
                    <HugeiconsIcon icon={Add01Icon} strokeWidth={2} />
                  </Link>
                  <UserMenu session={session} />
                </div>
              </header>
              <div
                id="main-content"
                tabIndex={-1}
                className="h-full w-full min-w-0 max-w-full overflow-x-clip px-4 pt-4 pb-12 outline-none md:px-8"
              >
                <Outlet />
              </div>
            </SidebarInset>
          </div>
        </SidebarProvider>
      </OnboardingProvider>
      <ExtensionRequiredDialog />
    </div>
  );
}
