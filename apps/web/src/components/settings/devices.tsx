import { ComputerIcon, SmartPhone01Icon, Tablet01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { IconSvgElement } from "@hugeicons/react";
import type { DateFormat } from "@myakiba/contracts/shared/types";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useInvalidateRead, useRead, useResourceMutation } from "@/data/client";
import { settings } from "@/data/resources/settings";
import type { Devices as DevicesResult } from "@/data/resources/settings";
import { formatDateOnlyForDisplay, formatRelativeTimeToNow } from "@/lib/date-display";
import { describeUserAgent, deviceName } from "@/lib/user-agent";
import { cn } from "@/lib/utils";
import type { DeviceKind } from "@/lib/user-agent";
import { SettingsRow, useSettingAnchor } from "./settings-row";
import { FreshSignInNotice } from "./sign-in-again";

const DEVICE_ICONS = {
  desktop: ComputerIcon,
  phone: SmartPhone01Icon,
  tablet: Tablet01Icon,
} as const satisfies Record<DeviceKind, IconSvgElement>;

const DAY_MS = 24 * 60 * 60 * 1000;

type DeviceSession = Extract<DevicesResult, { kind: "listed" }>["sessions"][number];

export function Devices({ dateFormat }: { readonly dateFormat: DateFormat }) {
  const { data, isPending, isError, error } = useRead(settings.devices);
  const refetchDevices = useInvalidateRead(settings.devices);
  const { className: anchorClassName, ...anchor } = useSettingAnchor<HTMLDivElement>("devices");

  if (isPending) {
    return (
      <div aria-busy="true" aria-label="Loading devices" className="flex flex-col">
        {[0, 1].map((row) => (
          <div key={row} className="flex flex-col gap-1.5 px-4 py-3.5">
            <Skeleton className="h-3.5 w-40" />
            <Skeleton className="h-3 w-56" />
          </div>
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-pretty text-sm text-destructive" role="alert">
          {error.message}
        </p>
        <Button variant="outline" size="sm" onClick={() => refetchDevices()}>
          Try again
        </Button>
      </div>
    );
  }

  if (data.kind === "needs-fresh-sign-in") {
    return (
      <div {...anchor} className={anchorClassName}>
        <FreshSignInNotice
          title="Sign in again to see your devices"
          description="For your security, myakiba lists the devices signed in to your account only within a day of signing in."
        />
      </div>
    );
  }

  const { currentSessionId } = data;
  const current = data.sessions.filter((session) => session.id === currentSessionId);
  const others = data.sessions.filter((session) => session.id !== currentSessionId);

  return (
    <>
      <div {...anchor} className={cn("divide-y divide-border/70", anchorClassName)}>
        {[...current, ...others].map((session) => (
          <DeviceRow
            key={session.id}
            session={session}
            isCurrent={session.id === currentSessionId}
            dateFormat={dateFormat}
          />
        ))}
      </div>
      <SignOutOthersRow hasOthers={others.length > 0} />
    </>
  );
}

// The server renews a session at most once a day, so its last update dates activity to the day.
function lastActive(updatedAt: Date): string {
  return Date.now() - updatedAt.getTime() < DAY_MS
    ? "Active in the last day"
    : `Last active ${formatRelativeTimeToNow(updatedAt)}`;
}

function DeviceRow({
  session,
  isCurrent,
  dateFormat,
}: {
  readonly session: DeviceSession;
  readonly isCurrent: boolean;
  readonly dateFormat: DateFormat;
}) {
  const signOut = useResourceMutation(settings.revokeSession);
  const device = describeUserAgent(session.userAgent);
  const name = deviceName(device);
  const details = [
    isCurrent ? "Active now" : lastActive(new Date(session.updatedAt)),
    `Signed in ${formatDateOnlyForDisplay(new Date(session.createdAt), dateFormat)}`,
    session.ipAddress,
  ].filter(Boolean);

  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="flex items-center gap-1.5 text-sm font-medium">
            <HugeiconsIcon
              icon={DEVICE_ICONS[device.kind]}
              className="size-4 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
            {name}
          </span>
          {isCurrent ? (
            <span className="rounded-md bg-foreground/[0.07] px-1.5 py-px text-[11px] font-medium text-muted-foreground">
              This device
            </span>
          ) : null}
        </div>
        <p className="text-[13px] leading-snug text-muted-foreground tabular-nums">
          {details.join(" · ")}
        </p>
      </div>
      {isCurrent ? null : (
        <Button
          variant="outline"
          size="sm"
          disabled={signOut.isPending}
          aria-label={`Sign out of ${name}`}
          onClick={() => signOut.run({ token: session.token, name })}
        >
          Sign out
        </Button>
      )}
    </div>
  );
}

function SignOutOthersRow({ hasOthers }: { readonly hasOthers: boolean }) {
  const signOut = useResourceMutation(settings.revokeOtherSessions);

  return (
    <SettingsRow setting="sign-out-others" inline>
      {hasOthers ? (
        <Button
          variant="outline"
          size="sm"
          disabled={signOut.isPending}
          onClick={() => signOut.run()}
        >
          Sign out others
        </Button>
      ) : (
        <span className="text-[13px] text-muted-foreground">No other devices</span>
      )}
    </SettingsRow>
  );
}
