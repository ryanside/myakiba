import { HugeiconsIcon } from "@hugeicons/react";
import type { IconSvgElement } from "@hugeicons/react";
import {
  ComputerIcon,
  LogoutSquare01Icon,
  Moon02Icon,
  Settings01Icon,
  Sun01Icon,
  UserIcon,
} from "@hugeicons/core-free-icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { authClient, endSession } from "@/lib/auth-client";
import { useNavigate } from "@tanstack/react-router";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import { useTheme } from "next-themes";
import type { Session } from "@/lib/session";
import { toast } from "@/components/ui/toast";
import { THEME_OPTIONS } from "@/lib/theme-options";
import type { ThemeValue } from "@/lib/theme-options";
import { Button } from "../ui/button";

const THEME_ICONS = {
  light: Sun01Icon,
  dark: Moon02Icon,
  system: ComputerIcon,
} satisfies Record<ThemeValue, IconSvgElement>;

export default function UserMenu({ session }: { session: Session }) {
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();

  const handleSignOut = async () => {
    const result = await endSession(() => authClient.signOut());
    if (result.error) {
      toast.add({
        type: "error",
        title: result.error.message || "Couldn't sign out. Try again.",
      });
      return;
    }
    toast.add({ type: "success", title: "Signed out successfully" });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Account menu"
        render={<Button variant="ghost" size="icon-lg" />}
      >
        <Avatar className="size-7">
          {session.user.image && <AvatarImage src={session.user.image} />}
          <AvatarFallback className="bg-linear-to-br from-background via-muted to-background">
            <HugeiconsIcon icon={UserIcon} className="size-4" />
          </AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-60" align="start" sideOffset={8}>
        <div className="flex bg-linear-to-br from-background via-muted to-background rounded-inner outline outline-border items-center gap-2 px-2 py-1.5 text-sm">
          <span className="text-foreground text-sm font-medium">{session.user.username}</span>
        </div>
        <div className="py-2.5">
          <Tabs value={theme ?? "system"} onValueChange={(v) => setTheme(v)}>
            <TabsList className="w-full" aria-label="Theme">
              {THEME_OPTIONS.map(({ value, label }) => (
                <TabsTrigger key={value} value={value} aria-label={label} className="h-6 flex-1">
                  <HugeiconsIcon icon={THEME_ICONS[value]} className="size-4" aria-hidden="true" />
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
        <DropdownMenuGroup>
          <DropdownMenuItem
            onClick={() => {
              navigate({
                to: "/profile/$username",
                params: { username: session.user.username ?? "" },
              });
            }}
          >
            <HugeiconsIcon icon={UserIcon} aria-hidden="true" />
            Profile
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => {
              navigate({ to: "/settings" });
            }}
          >
            <HugeiconsIcon icon={Settings01Icon} aria-hidden="true" />
            Settings
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={handleSignOut}>
          <HugeiconsIcon icon={LogoutSquare01Icon} aria-hidden="true" />
          Sign Out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
