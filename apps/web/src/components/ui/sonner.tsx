import { HugeiconsIcon } from "@hugeicons/react";
import {
  Alert01Icon,
  CheckmarkCircle01Icon,
  InformationCircleIcon,
  Loading03Icon,
  OctagonIcon,
} from "@hugeicons/core-free-icons";
import { useTheme } from "@/components/theme-provider";
import { Toaster as Sonner } from "sonner";
import type { ToasterProps } from "sonner";

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      icons={{
        success: <HugeiconsIcon icon={CheckmarkCircle01Icon} className="size-4" />,
        info: <HugeiconsIcon icon={InformationCircleIcon} className="size-4" />,
        warning: <HugeiconsIcon icon={Alert01Icon} className="size-4" />,
        error: <HugeiconsIcon icon={OctagonIcon} className="size-4" />,
        loading: <HugeiconsIcon icon={Loading03Icon} className="size-4 animate-spin" />,
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      {...props}
    />
  );
};

export { Toaster };
