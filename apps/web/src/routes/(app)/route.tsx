import { createFileRoute } from "@tanstack/react-router";
import { AppSidebar } from "@/components/sidebar/app-sidebar";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Outlet, redirect, useLocation } from "@tanstack/react-router";
import { ModeToggle } from "@/components/mode-toggle";
import UserMenu from "@/components/sidebar/user-menu";
import { authClient } from "@/lib/auth-client";
import { SearchCommand } from "@/components/sidebar/search-command";

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
  },
});

function RouteComponent() {
  const location = useLocation();
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="">
        <header className="flex h-12 shrink-0 items-center justify-between gap-2 px-4">
          <div className="flex items-center gap-0.5">
            <SidebarTrigger className="-ml-1" />
            <SearchCommand />
            <Separator
              orientation="vertical"
              className="mr-2 data-[orientation=vertical]:h-4"
            />
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbLink className="text-foreground">
                    {location.pathname.charAt(1).toUpperCase() +
                      location.pathname.slice(2)}
                  </BreadcrumbLink>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>
          <div className="flex items-center gap-2">
            <ModeToggle />
            <UserMenu />
          </div>
        </header>
        <div className="h-full w-full p-6">
          <Outlet />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
