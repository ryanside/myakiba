import {
  Home01Icon,
  PieChartIcon,
  ChartColumnIcon,
  LibraryIcon,
  PackageIcon,
  GithubIcon,
  DiscordIcon,
} from "@hugeicons/core-free-icons";

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
import { useRef } from "react";
import { MyAkibaLogo } from "@/components/myakiba-logo";
import { GitCompareIcon, type GitCompareIconHandle } from "../ui/git-compare";
import type { RouterAppContext } from "@/routes/__root";
import SyncWidget from "../sync/sync-widget";
import { Button } from "../ui/button";
import { PlusIcon, type PlusIconHandle } from "../ui/plus";

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
    },
    {
      title: "Expenses",
      url: "/expenses",
      icon: PieChartIcon,
    },
    {
      title: "Orders",
      url: "/orders",
      icon: PackageIcon,
    },
    {
      title: "Collection",
      url: "/collection",
      icon: LibraryIcon,
    },
  ],
  navSecondary: [
    {
      title: "Discord",
      url: "https://discord.gg/VKHVvhcC2z",
      icon: DiscordIcon,
    },
    {
      title: "Github",
      url: "https://github.com/ryanside/myakiba",
      icon: GithubIcon,
    },
  ],
};

export function AppSidebar({
  session,
  ...props
}: React.ComponentProps<typeof Sidebar> & {
  session: RouterAppContext["session"];
}) {
  const location = useLocation();
  const syncIconRef = useRef<GitCompareIconHandle>(null);
  const addItemsIconRef = useRef<PlusIconHandle>(null);

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
          <SidebarMenu className="space-y-1">
            <SidebarMenuItem>
              <SyncWidget
                session={session}
                TriggerWrapper={
                  <SidebarMenuButton
                    className="transition-all"
                    tooltip="Sync Items"
                    render={
                      <Button
                        variant="default"
                        className="justify-start"
                        onMouseEnter={() => addItemsIconRef.current?.startAnimation()}
                        onMouseLeave={() => addItemsIconRef.current?.stopAnimation()}
                      >
                        <PlusIcon ref={addItemsIconRef} />
                        <span>Sync Items</span>
                      </Button>
                    }
                  />
                }
              />
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton
                className="transition-all"
                tooltip="Sync History"
                render={
                  <Button
                    variant="outline"
                    onMouseEnter={() => syncIconRef.current?.startAnimation()}
                    onMouseLeave={() => syncIconRef.current?.stopAnimation()}
                  >
                    <Link to="/sync">
                      <GitCompareIcon ref={syncIconRef} size={17} className="text-primary" />
                      <span className="">Sync History</span>
                    </Link>
                  </Button>
                }
              ></SidebarMenuButton>
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
