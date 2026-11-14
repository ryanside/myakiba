import { HugeiconsIcon } from "@hugeicons/react";
import { Loading03Icon } from "@hugeicons/core-free-icons";
import { NotFound } from "@/components/errors/not-found";
import { RouteError } from "@/components/errors/route-error";

export const routerOptions = {
  defaultPreload: false,
  defaultPendingComponent: () => (
    <div className="flex min-h-dvh items-center justify-center pt-8">
      <HugeiconsIcon icon={Loading03Icon} className="animate-spin" />
    </div>
  ),
  defaultNotFoundComponent: NotFound,
  defaultErrorComponent: RouteError,
  scrollRestoration: true,
} as const;
