import { HugeiconsIcon } from "@hugeicons/react";
import { Loading03Icon } from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";

export default function Loader({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-col w-full h-full items-center justify-center", className)}>
      <HugeiconsIcon icon={Loading03Icon} className="animate-spin" />
    </div>
  );
}
