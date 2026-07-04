import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type SettingsSectionProps = {
  readonly title: string;
  readonly children: React.ReactNode;
};

export function SettingsSection({ title, children }: SettingsSectionProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
