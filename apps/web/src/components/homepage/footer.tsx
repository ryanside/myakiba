import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowUp01Icon } from "@hugeicons/core-free-icons";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTheme } from "next-themes";
import { Sun01Icon, Moon02Icon, ComputerIcon } from "@hugeicons/core-free-icons";

const links = [
  {
    title: "github",
    href: "https://github.com/ryanside/myakiba",
  },
  {
    title: "discord",
    href: "https://discord.gg/VKHVvhcC2z",
  },
];

const navigation = [
  {
    title: "features",
    href: "/#features",
  },
  {
    title: "faqs",
    href: "/#faqs",
  },
];

export default function FooterSection() {
  const { theme, setTheme } = useTheme();

  return (
    <footer className="bg-sidebar min-h-[250px]">
      <div className="flex gap-16 justify-start mx-auto max-w-7xl px-6 py-12">
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <span className="text-foreground block text-center text-sm">
              made by{" "}
              <a
                href="https://github.com/ryanside"
                target="_blank"
                rel="noopener noreferrer"
                className="text-foreground duration-150 hover:underline underline-offset-2"
              >
                @ryanside
              </a>
            </span>
          </div>

          <div className="flex flex-col gap-x-6 gap-y-4">
            {links.map((link) => (
              <a
                key={link.title}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className=" duration-150"
              >
                <div className="flex flex-row items-center gap-2">
                  <span className="hover:underline underline-offset-2 text-foreground text-sm">
                    {link.title}
                  </span>
                </div>
              </a>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-x-6 gap-y-4">
            {navigation.map((link) => (
              <a key={link.title} href={link.href} className=" duration-150">
                <div className="flex flex-row items-center gap-2">
                  <span className="hover:underline underline-offset-2 text-foreground text-sm">
                    {link.title}
                  </span>
                </div>
              </a>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-4 ml-auto max-sm:hidden">
          <div className="flex flex-row items-center gap-x-6 gap-y-4">
            <Tabs value={theme ?? "system"} onValueChange={setTheme}>
              <TabsList className="w-full">
                <TabsTrigger value="light" className="h-6 flex-1">
                  <HugeiconsIcon icon={Sun01Icon} className="size-4" aria-hidden="true" />
                </TabsTrigger>
                <TabsTrigger value="dark" className="h-6 flex-1">
                  <HugeiconsIcon icon={Moon02Icon} className="size-4" aria-hidden="true" />
                </TabsTrigger>
                <TabsTrigger value="system" className="h-6 flex-1">
                  <HugeiconsIcon icon={ComputerIcon} className="size-4" aria-hidden="true" />
                </TabsTrigger>
              </TabsList>
            </Tabs>{" "}
            <a href="/#hero" className="duration-150">
              <div className="flex flex-row items-center gap-2">
                <span className="hover:underline underline-offset-2  text-muted-foreground text-sm">
                  back to top <HugeiconsIcon icon={ArrowUp01Icon} className="size-3 inline-block" />
                </span>
              </div>
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
