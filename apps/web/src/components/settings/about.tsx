import { RefreshIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { env } from "@myakiba/env/web";
import type { ComponentType, SVGProps } from "react";
import { DISCORD_URL, GITHUB_URL, RELEASES_URL } from "@/components/homepage/links";
import { useOpenOnboarding } from "@/components/onboarding/onboarding-dialog";
import { DiscordLogo, GitHubLogo } from "@/components/ui/brand-icons";
import { Button, buttonVariants } from "@/components/ui/button";
import { useRead } from "@/data/client";
import { version } from "@/data/resources/version";
import { SettingsGroup } from "./settings-group";
import type { SettingId } from "./settings-registry";
import { SettingsRow } from "./settings-row";
import { ExternalIcon } from "@/lib/icons";

const COMMIT = /^[\da-f]{7,40}$/i;

export function About() {
  const openOnboarding = useOpenOnboarding();

  return (
    <>
      <SettingsGroup title="This version">
        <VersionRow />
        <ExternalRow
          setting="changelog"
          href={RELEASES_URL}
          logo={GitHubLogo}
          label="Read on GitHub"
        />
      </SettingsGroup>
      <SettingsGroup title="Help">
        <SettingsRow setting="getting-started" inline>
          <Button variant="outline" size="sm" aria-haspopup="dialog" onClick={openOnboarding}>
            Open
          </Button>
        </SettingsRow>
        <ExternalRow setting="discord" href={DISCORD_URL} logo={DiscordLogo} label="Join Discord" />
        <ExternalRow setting="github" href={GITHUB_URL} logo={GitHubLogo} label="Open GitHub" />
      </SettingsGroup>
    </>
  );
}

function BuildId({ id }: { readonly id: string }) {
  if (!COMMIT.test(id)) return <span className="text-sm tabular-nums">{id}</span>;
  return (
    <a
      href={`${GITHUB_URL}/commit/${id}`}
      target="_blank"
      rel="noopener noreferrer"
      className="-mx-1 rounded-sm px-1 text-sm tabular-nums underline decoration-foreground/30 underline-offset-4 hover:decoration-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      {id.slice(0, 7)}
      <span className="sr-only"> (opens the commit on GitHub)</span>
    </a>
  );
}

function VersionRow() {
  const { data } = useRead(version.current);
  const serverBuild = data?.buildId;
  const isBehind = serverBuild !== undefined && serverBuild !== env.VITE_BUILD_ID;

  return (
    <SettingsRow
      setting="version"
      inline
      status={
        isBehind ? <span className="text-xs text-warning-foreground">Update available</span> : null
      }
    >
      <span className="flex items-baseline gap-1.5 text-[13px] text-muted-foreground">
        Build <BuildId id={env.VITE_BUILD_ID} />
      </span>
      {isBehind ? (
        <>
          <span className="flex items-baseline gap-1.5 text-[13px] text-muted-foreground">
            Server has <BuildId id={serverBuild} />
          </span>
          <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
            <HugeiconsIcon icon={RefreshIcon} data-icon="inline-start" aria-hidden="true" />
            Refresh
          </Button>
        </>
      ) : null}
    </SettingsRow>
  );
}

function ExternalRow({
  setting,
  href,
  logo: Logo,
  label,
}: {
  readonly setting: SettingId;
  readonly href: string;
  readonly logo: ComponentType<SVGProps<SVGSVGElement>>;
  readonly label: string;
}) {
  return (
    <SettingsRow setting={setting} inline>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={buttonVariants({ variant: "outline", size: "sm" })}
      >
        <Logo data-icon="inline-start" aria-hidden="true" className="[&_path]:fill-current" />
        {label}
        <span className="sr-only"> (opens in a new tab)</span>
        <HugeiconsIcon
          icon={ExternalIcon}
          data-icon="inline-end"
          aria-hidden="true"
          className="text-muted-foreground"
        />
      </a>
    </SettingsRow>
  );
}
