import { BackLink } from "@/components/ui/back-link";
import type { ReactNode } from "react";

type AuthLayoutProps = {
  readonly children: ReactNode;
};

export function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <div className="bg-[background] flex min-h-svh">
      <div className="bg-background relative flex w-full flex-col lg:w-1/2">
        <div className="p-6 md:p-8">
          <BackLink to="/" text="Back to Home" font="sans" />
        </div>

        <div className="flex flex-1 items-center justify-center px-6 pb-12 md:px-10">
          <div className="w-full max-w-md">{children}</div>
        </div>
      </div>
      <div className="bg-[#DEDEDE] hidden lg:flex lg:w-1/2 relative overflow-hidden animate-appear ">
        <img
          src="/ma-black-white.webp"
          alt=""
          className="absolute inset-0 h-full w-full object-cover object-center scale-50"
        />
      </div>
    </div>
  );
}
