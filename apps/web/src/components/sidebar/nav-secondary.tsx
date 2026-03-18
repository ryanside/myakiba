import * as React from "react";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";

import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

export function NavSecondary({
  items,
  ...props
}: {
  items: {
    title: string;
    url: string;
    icon: IconSvgElement | React.ComponentType<React.SVGProps<SVGSVGElement>>;
  }[];
} & React.ComponentPropsWithoutRef<typeof SidebarGroup>) {
  return (
    <SidebarGroup {...props}>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => (
            <SidebarMenuItem key={item.title}>
              <SidebarMenuButton size="sm">
                <a href={item.url} target="_blank" rel="noopener noreferrer">
                  {typeof item.icon === "function" ? (
                    <item.icon />
                  ) : (
                    <HugeiconsIcon icon={item.icon} />
                  )}
                  <span>{item.title}</span>
                </a>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
