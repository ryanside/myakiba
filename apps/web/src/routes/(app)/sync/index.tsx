import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import {
  Stepper,
  StepperContent,
  StepperIndicator,
  StepperItem,
  StepperNav,
  StepperPanel,
  StepperSeparator,
  StepperTitle,
} from "@/components/ui/stepper";
import { Check, Info, LoaderCircleIcon } from "lucide-react";
import ChooseSyncOption from "@/components/sync/choose-sync-option";
import { authClient } from "@/lib/auth-client";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { useState } from "react";
import { toast } from "sonner";

const steps = [
  { title: "Choose sync option" },
  { title: "Enter Information" },
  { title: "Sync" },
];

export const Route = createFileRoute("/(app)/sync/")({
  component: RouteComponent,
  head: () => ({
    meta: [
      {
        name: "description",
        content: "sync MyFigureCollection data to myakiba",
      },
      {
        title: "Sync — myakiba",
      },
    ],
    links: [
      {
        rel: "icon",
        href: "/favicon.ico",
      },
    ],
    scripts: [],
  }),
});

function RouteComponent() {
  const navigate = useNavigate();
  const { data: session } = authClient.useSession();
  const [verificationEmailSent, setVerificationEmailSent] = useState(false);

  function handleSyncOption(option: "csv" | "order" | "collection") {
    navigate({ to: `/sync/${option}` });
  }

  async function handleResendVerificationEmail() {
    await authClient.sendVerificationEmail({
      email: session?.user.email ?? "",
      callbackURL: import.meta.env.PROD
        ? "https://myakiba.app/sync"
        : "http://localhost:3001/sync",
    });
    setVerificationEmailSent(true);
    toast.success("Verification email sent");
  }

  return (
    <div className="container mx-auto max-w-5xl px-4 py-2">
      <Stepper
        value={1}
        onValueChange={() => {
          // Prevent changing step from parent route
        }}
        defaultValue={1}
        indicators={{
          completed: <Check className="size-4" />,
          loading: <LoaderCircleIcon className="size-4 animate-spin" />,
        }}
        className="space-y-8"
      >
        <StepperNav>
          {steps.map((step, index) => (
            <StepperItem
              key={index}
              step={index + 1}
              className="relative flex-1 items-start"
            >
              <div className="flex flex-col gap-3 items-center rounded-full outline-none">
                <StepperIndicator>{index + 1}</StepperIndicator>
                <StepperTitle>{step.title}</StepperTitle>
              </div>

              {steps.length > index + 1 && (
                <StepperSeparator className="absolute top-3 inset-x-0 left-[calc(50%+0.875rem)] m-0 group-data-[orientation=horizontal]/stepper-nav:w-[calc(100%-2rem+0.225rem)] group-data-[orientation=horizontal]/stepper-nav:flex-none group-data-[state=completed]/step:bg-primary" />
              )}
            </StepperItem>
          ))}
        </StepperNav>

        {session?.user.emailVerified === false && (
          <Alert variant="destructive">
            <Info />
            <AlertTitle>Email not verified!</AlertTitle>
            <AlertDescription>
              <div className="flex flex-row gap-2">
                Please verify your email address via the link in the email we
                sent to you to access features of myakiba.
              </div>
            </AlertDescription>
            <AlertDescription className="flex flex-row gap-2 italic text-xs">
              Didn&apos;t receive the email?
              <Button
                mode="link"
                underline="solid"
                className="text-foreground hover:text-white text-xs italic"
                onClick={handleResendVerificationEmail}
                disabled={verificationEmailSent}
              >
                {verificationEmailSent
                  ? "Verification email sent."
                  : "Resend verification email"}
              </Button>
            </AlertDescription>
            <AlertDescription className="italic text-xs">
              Accounts with unverified emails will be deleted after 30 days.
            </AlertDescription>
          </Alert>
        )}

        <StepperPanel className="text-sm">
          <StepperContent value={1} className="flex items-center justify-center">
            <div className="flex flex-col w-full gap-4">
              <ChooseSyncOption
                handleSyncOption={handleSyncOption}
                emailVerified={session?.user.emailVerified ?? false}
              />
              <Accordion type="single" collapsible className="px-2">
                <AccordionItem value="item-1">
                  <AccordionTrigger>
                    How are items synced from MyFigureCollection?
                  </AccordionTrigger>
                  <AccordionContent>
                    Since MyFigureCollection does not provide an API, myakiba
                    scrapes the item(s) information from MyFigureCollection on
                    user request. Our scraper is{" "}
                    <span className="font-bold text-primary">
                      heavily rate limited/throttled
                    </span>{" "}
                    to prevent MyFigureCollection's servers from ever being
                    overwhelmed by us. From what we can tell, this adheres to
                    MyFigureCollection's terms of service. Users are also
                    limited to syncing a few times per hour to prevent abuse.
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem value="item-2">
                  <AccordionTrigger>
                    Why does it take a while to sync?
                  </AccordionTrigger>
                  <AccordionContent>
                    To prevent MyFigureCollection's servers from being
                    overwhelmed, we heavily rate limit/throttle our scraper.
                    This means that it may take a while to sync your items,
                    especially if you have a lot of items to scrape. We
                    appreciate your patience and understanding.
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem value="item-3">
                  <AccordionTrigger>
                    Why are some items not syncing?
                  </AccordionTrigger>
                  <AccordionContent>
                    Only SFW items are synced. NSFW items are not synced as
                    those are locked behind authentication on
                    MyFigureCollection's website, and cannot be scraped by our
                    scraper currently.
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </div>
          </StepperContent>
        </StepperPanel>
      </Stepper>
    </div>
  );
}

