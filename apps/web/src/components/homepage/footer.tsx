import { Link } from "@tanstack/react-router";
import { MyAkibaLogo } from "@/components/myakiba-logo";
import { ArrowUp } from "lucide-react";
import { ModeToggle } from "../mode-toggle";

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
                className="text-foreground hover:text-secondary duration-150 hover:underline underline-offset-2"
              >
                @ryanside
              </a>
            </span>
          </div>

          <div className="flex flex-col gap-x-6 gap-y-4">
            {links.map((link, index) => (
              <a
                key={index}
                href={link.href}
                target="_blank"
                className=" duration-150"
              >
                <div className="flex flex-row items-center gap-2">
                  <span className="hover:underline underline-offset-2 text-foreground hover:text-secondary text-sm">
                    {link.title}
                  </span>
                </div>
              </a>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-x-6 gap-y-4">
            {navigation.map((link, index) => (
              <a key={index} href={link.href} className=" duration-150">
                <div className="flex flex-row items-center gap-2">
                  <span className="hover:underline underline-offset-2 text-foreground hover:text-secondary text-sm">
                    {link.title}
                  </span>
                </div>
              </a>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-4 ml-auto max-sm:hidden">
          <div className="flex flex-row items-center gap-x-6 gap-y-4">
            <ModeToggle />
            <a href="/#hero" className="duration-150">
              <div className="flex flex-row items-center gap-2">
                <span className="hover:underline underline-offset-2  text-muted-foreground hover:text-foreground text-sm">
                  back to top <ArrowUp className="size-3 inline-block" />
                </span>
              </div>
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
