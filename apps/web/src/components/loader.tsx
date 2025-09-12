import { Loader2 } from "lucide-react";

export default function Loader() {
  return (
    <div className="flex min-h-dvh items-center justify-center pt-8">
      <Loader2 className="animate-spin" />
    </div>
  );
}
