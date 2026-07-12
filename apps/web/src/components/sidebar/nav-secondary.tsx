import * as React from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import type { IconSvgElement } from "@hugeicons/react";
import { Link } from "@tanstack/react-router";

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
    external: boolean;
  }[];
} & React.ComponentPropsWithoutRef<typeof SidebarGroup>) {
  return (
    <SidebarGroup {...props}>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => (
            <SidebarMenuItem key={item.title}>
              <SidebarMenuButton size="sm">
                {item.external ? (
                  <a href={item.url} target="_blank" rel="noopener noreferrer">
                    <NavIcon icon={item.icon} />
                    <span>{item.title}</span>
                  </a>
                ) : (
                  <Link to={item.url}>
                    <NavIcon icon={item.icon} />
                    <span>{item.title}</span>
                  </Link>
                )}
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

function NavIcon({
  icon: Icon,
}: {
  icon: IconSvgElement | React.ComponentType<React.SVGProps<SVGSVGElement>>;
}) {
  return typeof Icon === "function" ? (
    <Icon className="size-4 [&_path]:fill-current" />
  ) : (
    <HugeiconsIcon icon={Icon} />
  );
}
