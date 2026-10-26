import { ArrowUpRight01Icon, RefreshIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { env } from "@myakiba/env/web";
import { Link } from "@tanstack/react-router";
import type { ComponentType, SVGProps } from "react";
import { OnboardingDialog } from "@/components/onboarding/onboarding-dialog";
import { DiscordLogo, GitHubLogo } from "@/components/ui/brand-icons";
import { Button, buttonVariants } from "@/components/ui/button";
import { useRead } from "@/data/client";
import { version } from "@/data/resources/version";
import { changelogEntries, formatChangelogDate } from "@/lib/changelog";
import { SettingsGroup } from "./settings-group";
import type { SettingId } from "./settings-registry";
import { SettingsRow } from "./settings-row";

const REPOSITORY = "https://github.com/ryanside/myakiba";
const DISCORD = "https://discord.gg/VKHVvhcC2z";
const COMMIT = /^[\da-f]{7,40}$/i;

export function About() {
  return (
    <>
      <SettingsGroup title="This version">
        <VersionRow />
        <ChangelogRow />
      </SettingsGroup>
      <SettingsGroup title="Help">
        <SettingsRow setting="getting-started" inline>
          <OnboardingDialog
            opensForNewAccount={false}
            renderTrigger={
              <Button variant="outline" size="sm">
                Open
              </Button>
            }
          />
        </SettingsRow>
        <ExternalRow setting="discord" href={DISCORD} logo={DiscordLogo} label="Join Discord" />
        <ExternalRow setting="github" href={REPOSITORY} logo={GitHubLogo} label="Open GitHub" />
      </SettingsGroup>
    </>
  );
}

function BuildId({ id }: { readonly id: string }) {
  if (!COMMIT.test(id)) return <span className="text-sm tabular-nums">{id}</span>;
  return (
    <a
      href={`${REPOSITORY}/commit/${id}`}
      target="_blank"
      rel="noopener noreferrer"
      className="rounded-sm text-sm tabular-nums underline decoration-foreground/30 underline-offset-4 hover:decoration-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
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

function ChangelogRow() {
  const latest = changelogEntries[0];

  return (
    <SettingsRow
      setting="changelog"
      inline
      status={
        latest ? (
          <span className="text-xs text-muted-foreground">
            Updated {formatChangelogDate(latest.date)}
          </span>
        ) : null
      }
    >
      <Button variant="outline" size="sm" render={<Link to="/changelog" />} nativeButton={false}>
        Read
      </Button>
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
          icon={ArrowUpRight01Icon}
          data-icon="inline-end"
          aria-hidden="true"
          className="text-muted-foreground"
        />
      </a>
    </SettingsRow>
  );
}
