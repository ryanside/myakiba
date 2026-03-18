import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { Collapsible } from "@/components/ui/collapsible";
import {
  SidebarGroup,
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
    icon: IconSvgElement;
    isActive?: boolean;
    items?: {
      title: string;
      url: string;
    }[];
  }[];
  location: ParsedLocation;
}) {
  return (
    <SidebarGroup>
      <SidebarMenu>
        {items.map((item) => (
          <Collapsible key={item.title} defaultOpen={item.isActive}>
            <SidebarMenuItem>
              <SidebarMenuButton
                className="data-[active=true]:shadow-[0_0_0_1px_var(--color-border),0_1px_2px_0_rgb(0_0_0/0.05)] data-[active=true]:text-sidebar-accent-foreground text-muted-foreground"
                tooltip={item.title}
                isActive={location.pathname === `${item.url}`}
              >
                <Link to={item.url}>
                  <HugeiconsIcon icon={item.icon} />
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
