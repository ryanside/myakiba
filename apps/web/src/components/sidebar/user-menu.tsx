import { HugeiconsIcon } from "@hugeicons/react";
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
import { authClient } from "@/lib/auth-client";
import { useNavigate } from "@tanstack/react-router";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import { useQueryClient } from "@tanstack/react-query";
import { useTheme } from "next-themes";
import { setThemeWithTransition } from "@/lib/theme-transition";
import type { RouterAppContext } from "@/routes/__root";
import { toast } from "sonner";
import { Button } from "../ui/button";

export default function UserMenu({ session }: { session: RouterAppContext["session"] }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { theme, setTheme } = useTheme();

  const handleSignOut = () => {
    authClient.signOut({
      fetchOptions: {
        onSuccess: () => {
          toast.success("Signed out successfully");
          queryClient.clear();
          navigate({ to: "/login" });
        },
      },
    });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon-lg" />}>
        <Avatar className="size-7">
          {session.user.image && <AvatarImage src={session.user.image} />}
          <AvatarFallback className="bg-linear-to-br from-background via-muted to-background">
            <HugeiconsIcon icon={UserIcon} className="size-4" />
          </AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-60" align="start" sideOffset={8}>
        <div className="flex bg-linear-to-br from-background via-muted to-background rounded-sm outline outline-border items-center gap-2 px-2 py-1.5 text-sm">
          <span className="text-foreground text-sm font-medium">{session.user.username}</span>
        </div>
        <div className="py-2.5">
          <Tabs
            value={theme ?? "system"}
            onValueChange={(v) => setThemeWithTransition(v, setTheme)}
          >
            <TabsList className="w-full">
              <TabsTrigger value="light" className="h-6 flex-1">
                <HugeiconsIcon icon={Sun01Icon} className="size-4" aria-hidden="true" />
              </TabsTrigger>
              <TabsTrigger value="dark" className="h-6 flex-1">
                <HugeiconsIcon icon={Moon02Icon} className="size-4" aria-hidden="true" />
              </TabsTrigger>
              <TabsTrigger value="system" className="h-6 flex-1">
                <HugeiconsIcon icon={ComputerIcon} className="size-4" aria-hidden="true" />
              </TabsTrigger>
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
