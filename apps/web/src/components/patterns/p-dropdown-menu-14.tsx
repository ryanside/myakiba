"use client";

import { useState } from "react";
import { Badge } from "@/components/reui/badge";

import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  UnfoldMoreIcon,
  Sun01Icon,
  Moon02Icon,
  ComputerIcon,
  Building01Icon,
  Call02Icon,
  Tick02Icon,
  SettingsIcon,
  LifebuoyIcon,
  LogoutSquare01Icon,
} from "@hugeicons/core-free-icons";

const statuses = [
  { value: "available", label: "Available", color: "bg-green-500" },
  { value: "away", label: "Away", color: "bg-amber-500" },
  { value: "busy", label: "Busy", color: "bg-red-500" },
  { value: "offline", label: "Offline", color: "bg-gray-400" },
];

export function Pattern() {
  const [status, setStatus] = useState("available");
  const [theme, setTheme] = useState("light");

  const activeStatus = statuses.find((s) => s.value === status) || statuses[0];

  return (
    <div className="flex items-center justify-center">
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="outline" className="w-40" />}>
          <Avatar className="size-4">
            <AvatarImage src="https://github.com/shadcn.png" />
            <AvatarFallback>CN</AvatarFallback>
          </Avatar>
          <span className="text-sm font-medium">shadcn</span>

          <HugeiconsIcon
            icon={UnfoldMoreIcon}
            strokeWidth={2}
            className="ml-auto opacity-60"
            aria-hidden="true"
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-60" align="start" sideOffset={8}>
          <div className="flex items-center gap-3 px-1 pt-1.5">
            <Avatar className="size-8">
              <AvatarImage src="https://github.com/shadcn.png" />
              <AvatarFallback>CN</AvatarFallback>
            </Avatar>
            <div className="flex flex-col">
              <span className="text-foreground text-sm font-medium">shadcn</span>
              <span className="text-muted-foreground text-xs">ui@shadcn.com</span>
            </div>
          </div>
          <div className="py-2.5">
            <Tabs value={theme} onValueChange={setTheme}>
              <TabsList className="w-full">
                <TabsTrigger value="light" className="h-6 flex-1">
                  <HugeiconsIcon
                    icon={Sun01Icon}
                    strokeWidth={2}
                    className="size-4"
                    aria-hidden="true"
                  />
                </TabsTrigger>
                <TabsTrigger value="dark" className="h-6 flex-1">
                  <HugeiconsIcon
                    icon={Moon02Icon}
                    strokeWidth={2}
                    className="size-4"
                    aria-hidden="true"
                  />
                </TabsTrigger>
                <TabsTrigger value="system" className="h-6 flex-1">
                  <HugeiconsIcon
                    icon={ComputerIcon}
                    strokeWidth={2}
                    className="size-4"
                    aria-hidden="true"
                  />
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          <DropdownMenuGroup>
            <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="justify-between">
              <span className="flex items-center gap-2">
                <HugeiconsIcon icon={Building01Icon} strokeWidth={2} aria-hidden="true" />
                Your Companies
              </span>
              <Badge variant="secondary" size="sm" className="rounded-full px-1.5">
                12
              </Badge>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="justify-between">
              <span className="flex items-center gap-2">
                <HugeiconsIcon icon={Call02Icon} strokeWidth={2} aria-hidden="true" />
                Your Numbers
              </span>
              <Badge variant="secondary" size="sm" className="rounded-full px-1.5">
                2
              </Badge>
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <span className="flex items-center gap-2">
                <span className={cn("size-2 rounded-full", activeStatus.color)} />
                {activeStatus.label}
              </span>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-40">
              {statuses.map((s) => (
                <DropdownMenuItem
                  key={s.value}
                  onClick={() => setStatus(s.value)}
                  className="justify-between"
                >
                  <span className="flex items-center gap-2">
                    <span className={`size-2 rounded-full ${s.color}`} />
                    {s.label}
                  </span>
                  {status === s.value && (
                    <HugeiconsIcon
                      icon={Tick02Icon}
                      strokeWidth={2}
                      className="text-muted-foreground size-4"
                      aria-hidden="true"
                    />
                  )}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem>
              <HugeiconsIcon icon={SettingsIcon} strokeWidth={2} aria-hidden="true" />
              Settings
            </DropdownMenuItem>
            <DropdownMenuItem>
              <HugeiconsIcon icon={LifebuoyIcon} strokeWidth={2} aria-hidden="true" />
              Help Center
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive">
            <HugeiconsIcon icon={LogoutSquare01Icon} strokeWidth={2} aria-hidden="true" />
            Logout
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
