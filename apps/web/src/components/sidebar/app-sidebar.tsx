import {
  Add01Icon,
  Calendar01Icon,
  Home01Icon,
  ChartColumnIcon,
  CreditCardIcon,
  LibraryIcon,
  PackageIcon,
  Settings01Icon,
  GitCompareIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { DiscordLogo, GitHubLogo } from "@/components/ui/brand-icons";

import { NavMain } from "@/components/sidebar/nav-main";
import { NavSecondary } from "@/components/sidebar/nav-secondary";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import { Link, useLocation } from "@tanstack/react-router";
import { MyAkibaLogo } from "@/components/myakiba-logo";
import SyncWidget from "../sync/sync-widget";
import { Button } from "../ui/button";

const data = {
  navMain: [
    {
      title: "Dashboard",
      url: "/dashboard",
      icon: Home01Icon,
    },
    {
      title: "Analytics",
      url: "/analytics",
      icon: ChartColumnIcon,
      pathnameMatch: "prefix" as const,
    },
    {
      title: "Expenses",
      url: "/expenses",
      icon: CreditCardIcon,
      pathnameMatch: "prefix" as const,
    },
    {
      title: "Orders",
      url: "/orders",
      icon: PackageIcon,
      pathnameMatch: "prefix" as const,
    },
    {
      title: "Collection",
      url: "/collection",
      icon: LibraryIcon,
    },
    {
      title: "Calendar",
      url: "/calendar",
      icon: Calendar01Icon,
    },
    {
      title: "Sync History",
      url: "/sync",
      icon: GitCompareIcon,
      pathnameMatch: "prefix" as const,
    },
    {
      title: "Settings",
      url: "/settings",
      icon: Settings01Icon,
    },
  ],
  navSecondary: [
    {
      title: "Discord",
      url: "https://discord.gg/VKHVvhcC2z",
      icon: DiscordLogo,
    },
    {
      title: "GitHub",
      url: "https://github.com/ryanside/myakiba",
      icon: GitHubLogo,
    },
  ],
};

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const location = useLocation();

  return (
    <Sidebar variant="inset" collapsible="icon" {...props}>
      <SidebarRail className="hover:after:bg-transparent" />
      <SidebarHeader className="py-0">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              className="flex justify-start items-center bg-transparent! group-data-[collapsible=icon]:p-0! w-full"
            >
              <Link to="/dashboard">
                <MyAkibaLogo
                  size="icon"
                  className="ml-2 scale-175 opacity-0 group-data-[collapsible=icon]:opacity-100 transition-opacity duration-100 ease-in-out"
                />
                <MyAkibaLogo
                  size="full"
                  className="ml-1 scale-500 opacity-100 group-data-[collapsible=icon]:opacity-0 transition-opacity duration-100 ease-in-out"
                />
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent className="gap-0">
        <SidebarGroup>
          <SidebarMenu>
            <SidebarMenuItem>
              <SyncWidget
                TriggerWrapper={
                  <SidebarMenuButton
                    className="transition-all hover:bg-primary/90 hover:text-primary-foreground active:bg-primary/90 active:text-primary-foreground data-active:bg-primary data-active:text-primary-foreground data-open:hover:bg-primary/90 data-open:hover:text-primary-foreground"
                    tooltip="Sync Items"
                    render={
                      <Button variant="default" className="justify-start">
                        <HugeiconsIcon icon={Add01Icon} strokeWidth={2} />
                        <span>Sync Items</span>
                      </Button>
                    }
                  />
                }
              />
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
        <NavMain items={data.navMain} location={location} />
      </SidebarContent>
      <SidebarFooter className="px-0">
        <NavSecondary items={data.navSecondary} className="mt-auto text-muted-foreground" />
      </SidebarFooter>
    </Sidebar>
  );
}
