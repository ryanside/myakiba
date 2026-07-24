import { createFileRoute, stripSearchParams, useNavigate } from "@tanstack/react-router";
import { SettingsShell } from "@/components/settings/settings-shell";
import { DEFAULT_SETTINGS_SECTION, settingsSearchSchema } from "@/components/settings/sections";
import type { SettingsSectionId } from "@/components/settings/sections";

export const Route = createFileRoute("/(app)/settings")({
  validateSearch: settingsSearchSchema,
  search: {
    middlewares: [stripSearchParams({ section: DEFAULT_SETTINGS_SECTION })],
  },
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

function RouteComponent() {
  const { session } = Route.useRouteContext();
  const { section } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });

  const onSectionChange = (next: SettingsSectionId) => {
    void navigate({
      search: next === DEFAULT_SETTINGS_SECTION ? {} : { section: next },
    });
  };

  return <SettingsShell user={session.user} section={section} onSectionChange={onSectionChange} />;
}
