import { HugeiconsIcon } from "@hugeicons/react";
import { Loading03Icon } from "@hugeicons/core-free-icons";

export default function Loader() {
  return (
    <div className="flex flex-col w-full h-full items-center justify-center">
      <HugeiconsIcon icon={Loading03Icon} className="animate-spin" />
    </div>
  );
}
