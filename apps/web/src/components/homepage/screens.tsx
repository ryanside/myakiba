import { useEffect, useMemo, useState } from "react";
import { ScreenPlaceholder } from "@/components/homepage/framed-screen";
import type { ShowcaseScreenName } from "@/components/showcase/names";
import { prepareShowcaseScreens } from "@/components/showcase/prepare";
import { ShowcaseScreen } from "@/components/showcase/showcase-screen";

export default function HomeScreen({
  name,
  frame,
}: {
  readonly name: ShowcaseScreenName;
  readonly frame: string;
}) {
  const now = useMemo(() => new Date(), []);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let live = true;
    const prepare = async () => {
      await prepareShowcaseScreens([name]);
      if (live) setReady(true);
    };
    void prepare();
    return () => {
      live = false;
    };
  }, [name]);

  return (
    <div className={frame}>
      {ready ? (
        <ShowcaseScreen name={name} now={now} className="w-full animate-data-in" />
      ) : (
        <ScreenPlaceholder />
      )}
    </div>
  );
}
