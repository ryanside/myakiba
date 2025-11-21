import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { authClient } from "@/lib/auth-client";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "../ui/button";
import { Skeleton } from "../ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import { LogOut, Settings, User } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

export default function UserMenu() {
  const navigate = useNavigate();
  const { data: session, isPending } = authClient.useSession();
  const queryClient = useQueryClient();
  if (isPending) {
    return <Skeleton className="h-8 w-8 rounded-full" />;
  }

  if (!session) {
    navigate({
      to: "/login",
    });

    return null;
  }

  const handleSignOut = async () => {
    authClient.signOut({
      fetchOptions: {
        onSuccess: async () => {
          await queryClient.invalidateQueries();
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
          <AvatarFallback className="bg-gradient-to-br from-background via-muted to-background">
            <User className="size-4" />
          </AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="min-w-48">
        <div className="flex bg-gradient-to-br from-background via-muted to-background rounded-sm outline outline-border items-center gap-2 px-2 py-1.5 text-sm">
          {session.user.username}
        </div>
        <DropdownMenuSeparator />
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
