import { lazy, Suspense } from "react";
import type { ShowcaseScreenName } from "@/components/showcase/screens";

const HomeScreen = lazy(() => import("@/components/homepage/screens"));

export function ScreenPlaceholder() {
  return <div className="aspect-[1440/900] w-full bg-background" />;
}

export function FramedScreen({
  name,
  className,
}: {
  readonly name: ShowcaseScreenName;
  readonly className: string;
}) {
  return (
    <Suspense fallback={<ScreenPlaceholder />}>
      <HomeScreen name={name} frame={className} />
    </Suspense>
  );
}
