import { Link } from "@tanstack/react-router";
import { MyAkibaLogo } from "@/components/myakiba-logo";

const links = [
  {
    title: "github",
    href: "https://github.com/ryanside/myakiba",
  },
];

export default function FooterSection() {
  return (
    <footer className="bg-background py-6">
      <div className="mx-auto max-w-7xl px-6">
        <div className="flex flex-wrap justify-center gap-6">
          <div className="order-last flex items-center gap-3 md:order-first">
            <span className="text-foreground block text-center text-sm">
              made by{" "}
              <a
                href="https://github.com/ryanside"
                target="_blank"
                className="text-foreground hover:text-white duration-150 underline underline-offset-2"
              >
                @ryanside
              </a>
            </span>
          </div>

          <div className="order-first flex flex-wrap gap-x-6 gap-y-4 md:order-last">
            {links.map((link, index) => (
              <a
                key={index}
                href={link.href}
                target="_blank"
                className="text-foreground hover:text-white duration-150"
              >
                <div className="flex flex-row items-center gap-2">
                  <span className="underline  underline-offset-2 text-sm">{link.title}</span>
                </div>
              </a>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
