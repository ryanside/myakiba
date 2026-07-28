import { createFileRoute, useNavigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
import * as z from "zod";
import { Account } from "@/components/settings/account";
import { Preferences } from "@/components/settings/preferences";
import { Profile } from "@/components/settings/profile";
import { SettingsContent } from "@/components/settings/settings-content";
import { SettingsNav } from "@/components/settings/settings-nav";
import { SETTINGS_IDS } from "@/components/settings/settings-sections";
import type { SettingsId } from "@/components/settings/settings-sections";
import type { User } from "@/lib/auth-client";

const settingsSearchSchema = z.object({
  section: z.enum(SETTINGS_IDS).optional(),
});

export const Route = createFileRoute("/(app)/settings")({
  validateSearch: settingsSearchSchema,
  component: RouteComponent,
  head: () => ({
    meta: [
      {
        name: "description",
        content: "your settings",
      },
      {
        title: "Settings - myakiba",
      },
    ],
  }),
});

function renderSection(section: SettingsId, user: User): ReactNode {
  switch (section) {
    case "preferences":
      return <Preferences user={user} />;
    case "profile":
      return <Profile user={user} />;
    case "account":
      return <Account />;
    default: {
      const _exhaustive: never = section;
      return _exhaustive;
    }
  }
}

function RouteComponent() {
  const { session } = Route.useRouteContext();
  const selectedSection = Route.useSearch().section;
  const activeSection = selectedSection ?? "preferences";
  const navigate = useNavigate({ from: Route.fullPath });

  return (
    <div className="mx-auto w-full max-w-5xl">
      <div className="flex flex-col gap-8 md:flex-row md:items-start md:gap-12">
        <div className={selectedSection ? "hidden md:block" : "block md:w-52 md:shrink-0"}>
          <SettingsNav
            activeId={activeSection}
            onSelect={(nextSection) => {
              void navigate({
                search: {
                  section: nextSection,
                },
              });
            }}
          />
        </div>
        <div className={selectedSection ? "min-w-0 flex-1" : "hidden min-w-0 flex-1 md:block"}>
          <SettingsContent activeId={activeSection}>
            {renderSection(activeSection, session.user)}
          </SettingsContent>
        </div>
      </div>
    </div>
  );
}
