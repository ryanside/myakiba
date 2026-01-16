import type { LucideIcon } from "lucide-react";

import { Collapsible } from "@/components/ui/collapsible";
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { Link } from "@tanstack/react-router";
import type { ParsedLocation } from "@tanstack/react-router";

export function NavManagement({
  items,
  location,
}: {
  items: {
    title: string;
    url: string;
    icon: LucideIcon;
    isActive?: boolean;
    items?: {
      title: string;
      url: string;
    }[];
  }[];
  location: ParsedLocation;
}) {
  return (
    <SidebarGroup className="group-data-[collapsible=icon]:pt-1">
      <SidebarGroupLabel className="group-data-[collapsible=icon]:-z-10 transition-all duration-100 ease-in-out">
        Manage
      </SidebarGroupLabel>
      <SidebarMenu>
        {items.map((item) => (
          <Collapsible key={item.title} asChild defaultOpen={item.isActive}>
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                className="data-[active=true]:shadow-md data-[active=true]:outline data-[active=true]:text-sidebar-accent-foreground text-muted-foreground"
                tooltip={item.title}
                isActive={location.pathname === `${item.url}`}
              >
                <Link to={item.url}>
                  <item.icon />
                  <span>{item.title}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </Collapsible>
        ))}
      </SidebarMenu>
    </SidebarGroup>
  );
}
