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

type NavSecondaryItem = {
  title: string;
  url: string;
  external: boolean;
} & (
  | { iconType: "hugeicon"; icon: IconSvgElement }
  | { iconType: "component"; icon: React.ComponentType<React.SVGProps<SVGSVGElement>> }
);

export function NavSecondary({
  items,
  children,
  ...props
}: {
  items: NavSecondaryItem[];
} & React.ComponentPropsWithoutRef<typeof SidebarGroup>) {
  return (
    <SidebarGroup {...props}>
      <SidebarGroupContent>
        <SidebarMenu>
          {children}
          {items.map((item) => (
            <SidebarMenuItem key={item.title}>
              <SidebarMenuButton size="sm">
                {item.external ? (
                  <a href={item.url} target="_blank" rel="noopener noreferrer">
                    <NavIcon item={item} />
                    <span>{item.title}</span>
                  </a>
                ) : (
                  <Link to={item.url}>
                    <NavIcon item={item} />
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

function NavIcon({ item }: { item: NavSecondaryItem }) {
  if (item.iconType === "component") {
    const Icon = item.icon;
    return <Icon className="size-4 [&_path]:fill-current" />;
  }

  return <HugeiconsIcon icon={item.icon} />;
}
