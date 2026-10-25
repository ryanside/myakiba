import { createFileRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";
import * as z from "zod";
import { PageHeader } from "@/components/page-header";
import { About } from "@/components/settings/about";
import { Account } from "@/components/settings/account";
import { Appearance } from "@/components/settings/appearance";
import { DataTransfer } from "@/components/settings/data-transfer";
import { Layout } from "@/components/settings/layout";
import { Preferences } from "@/components/settings/preferences";
import { Profile } from "@/components/settings/profile";
import { SettingsContent } from "@/components/settings/settings-content";
import { SettingsGroup } from "@/components/settings/settings-group";
import { SettingsNav } from "@/components/settings/settings-nav";
import { SETTINGS_SECTION_IDS, SETTINGS_SECTIONS } from "@/components/settings/settings-registry";
import type { SettingsSectionId } from "@/components/settings/settings-registry";
import { SettingsSearchField, SettingsSearchResults } from "@/components/settings/settings-search";
import type { Session } from "@/lib/session";
import { cn } from "@/lib/utils";

// The router parses `?q=123` as a number and `?q={}` as an object, so text keeps a scalar's text
// and drops anything else rather than failing the page.
const scalarText = z.union([z.string(), z.number(), z.boolean()]).transform(String);
const searchText = z
  .unknown()
  .transform((value) => scalarText.safeParse(value).data)
  .optional();

const settingsSearchSchema = z.object({
  section: z.enum(SETTINGS_SECTION_IDS).optional(),
  q: searchText,
  /** Better Auth's code for a Google link that failed, on the way back from Google. */
  error: searchText,
});

export const Route = createFileRoute("/(app)/settings")({
  validateSearch: settingsSearchSchema.parse,
  component: RouteComponent,
  head: ({ match }) => {
    const section = match.search.section;
    return {
      meta: [
        { name: "description", content: "your settings" },
        {
          title: section
            ? `${SETTINGS_SECTIONS[section].label} · Settings - myakiba`
            : "Settings - myakiba",
        },
      ],
    };
  },
});

const SECTION_CONTENT = {
  preferences: ({ user }) => <Preferences user={user} />,
  appearance: () => <Appearance />,
  layout: () => <Layout />,
  profile: ({ user }) => <Profile user={user} />,
  account: ({ user }) => <Account user={user} />,
  "data-transfer": () => (
    <SettingsGroup title="Your records" variant="cards">
      <DataTransfer />
    </SettingsGroup>
  ),
  about: () => <About />,
} as const satisfies Record<SettingsSectionId, (session: NonNullable<Session>) => ReactNode>;

function RouteComponent() {
  const { session } = Route.useRouteContext();
  const { section: selected, q = "" } = Route.useSearch();
  const query = q.trim();
  const isSearching = query.length > 0;
  const section = selected ?? "preferences";
  // On a phone the nav and a section are separate screens, and search results replace the nav.
  const isPhoneDetail = selected !== undefined && !isSearching;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 md:gap-8">
      <div className={cn(isPhoneDetail && "max-md:sr-only")}>
        <PageHeader title="Settings" />
      </div>
      <div className="flex flex-col gap-6 md:flex-row md:items-start md:gap-10">
        <aside
          className={cn(
            "flex flex-col gap-5 md:sticky md:top-6 md:w-56 md:shrink-0",
            isPhoneDetail && "max-md:hidden",
          )}
        >
          <SettingsSearchField query={q} />
          <div className={cn(isSearching && "max-md:hidden")}>
            <SettingsNav current={isSearching ? null : section} selected={selected} />
          </div>
        </aside>
        <div className={cn("min-w-0 flex-1", !selected && !isSearching && "max-md:hidden")}>
          {isSearching ? (
            <SettingsSearchResults query={query} />
          ) : (
            <SettingsContent key={section} section={section}>
              {SECTION_CONTENT[section](session)}
            </SettingsContent>
          )}
        </div>
      </div>
    </div>
  );
}
