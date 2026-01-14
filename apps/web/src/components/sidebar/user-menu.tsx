import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { authClient } from "@/lib/auth-client";
import { useNavigate } from "@tanstack/react-router";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import { LogOut, Settings, User } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { ModeToggle } from "../mode-toggle";
import { type RouterAppContext } from "@/routes/__root";
import { clearRecentItems } from "@/lib/recent-items";

export default function UserMenu({ session }: { session: RouterAppContext["session"] }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  if (!session) {
    navigate({
      to: "/login",
    });

    return null;
  }

  const handleSignOut = async () => {
    authClient.signOut({
      fetchOptions: {
        onSuccess: () => {
          // Clear all React Query cache (not just invalidate)
          queryClient.clear();
          // Clear localStorage
          clearRecentItems();
          navigate({
            to: "/login",
          });
        },
      },
    });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Avatar className="h-8 w-8">
          {session.user.image && <AvatarImage src={session.user.image} />}
          <AvatarFallback className="bg-linear-to-br from-background via-muted to-background">
            <User className="size-4" />
          </AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="min-w-48">
        <div className="flex bg-linear-to-br from-background via-muted to-background rounded-sm outline outline-border items-center gap-2 px-2 py-1.5 text-sm">
          {session.user.username}
        </div>
        <DropdownMenuSeparator />
        <ModeToggle className="mb-1"/>

        <DropdownMenuItem
          onClick={() => {
            navigate({
              to: "/profile/$username",
              params: {
                username: session.user.username ?? "",
              },
            });
          }}
        >
          <User />
          Profile
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => {
            navigate({
              to: "/settings",
            });
          }}
        >
          <Settings />
          Settings
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => {
            handleSignOut();
          }}
        >
          <LogOut />
          Sign Out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
