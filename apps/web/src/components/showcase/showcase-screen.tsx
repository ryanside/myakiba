import { AppShell } from "./app-shell";
import { SHOWCASE_SCREENS } from "./screens";
import type { ShowcaseScreenName } from "./names";
import { ShowcaseFrame } from "./showcase-frame";

/** One app screen as a picture of the app, scaled to fit its box. */
export function ShowcaseScreen({
  name,
  now,
  className,
}: {
  readonly name: ShowcaseScreenName;
  readonly now: Date;
  readonly className?: string;
}) {
  const { label, path, Screen } = SHOWCASE_SCREENS[name];
  return (
    <ShowcaseFrame label={label} className={className}>
      <AppShell path={path}>
        <Screen now={now} />
      </AppShell>
    </ShowcaseFrame>
  );
}
