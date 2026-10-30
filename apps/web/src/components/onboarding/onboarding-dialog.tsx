import { useCallback, useEffect, useRef, useState } from "react";
import { useForm } from "@tanstack/react-form";
import { z } from "zod";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowLeft01Icon,
  ArrowRight01Icon,
  Loading03Icon,
  Tick02Icon,
} from "@hugeicons/core-free-icons";

import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Stepper,
  StepperContent,
  StepperIndicator,
  StepperItem,
  StepperNav,
  StepperPanel,
  StepperTrigger,
} from "@/components/reui/stepper";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { CurrencySelect } from "@/components/currency-select";
import { useResourceMutation } from "@/data/client";
import { settings } from "@/data/resources/settings";
import { useOnboarding } from "@/hooks/use-onboarding";
import { authClient, decodeAuth } from "@/lib/auth-client";
import { formatDateOnlyForDisplay } from "@/lib/date-display";
import { cn } from "@/lib/utils";
import { ExtensionStep } from "@/components/onboarding/extension-step";
import { MissingExtensionNotice, pickExtensionCopy } from "@/components/extension/extension-notice";
import { CURRENCIES, DATE_FORMATS } from "@myakiba/contracts/shared/constants";
import type { Currency, DateFormat } from "@myakiba/contracts/shared/types";
import { getRouteApi, useNavigate, useRouter } from "@tanstack/react-router";
import { formSubmitHandler, runSubmit } from "@/lib/form-submit";

type StepId = "welcome" | "preferences" | "extension" | "add";

type StepMeta = {
  readonly id: StepId;
  readonly step: number;
  readonly eyebrow: string;
  readonly title: string;
  readonly description: string;
};

const STEPS: readonly [StepMeta, ...StepMeta[]] = [
  {
    id: "welcome",
    step: 1,
    eyebrow: "Onboarding",
    title: "Welcome to myakiba.",
    description:
      "A quick first setup. myakiba is in early access so expect rough edges and limited features - but we're working hard to make it better. thanks :D",
  },
  {
    id: "preferences",
    step: 2,
    eyebrow: "Preferences",
    title: "Set your username, currency, and date format.",
    description: "Click continue to save your preferences.",
  },
  {
    id: "extension",
    step: 3,
    eyebrow: "Extension",
    title: "Install the myakiba extension.",
    description:
      "myakiba gets MyFigureCollection items through its browser extension, with your own MyFigureCollection sign-in. You need it to add items, but you can finish setup without it.",
  },
  {
    id: "add",
    step: 4,
    eyebrow: "Add items",
    title: "Pick your first items.",
    description: "You can add more any time with the Add button in the header.",
  },
];

const FIRST_STEP = 1;
const LAST_STEP = STEPS.length;
const EXTENSION_STEP = STEPS.find((meta) => meta.id === "extension")?.step ?? FIRST_STEP;
const SAVE_FAILED = "Couldn't save onboarding.";
const MIN_USERNAME = 3;
const MAX_USERNAME = 30;
const PANEL_MIN_HEIGHT = "min-h-[440px]";
const EASE_OUT = "ease-[cubic-bezier(0.23,1,0.32,1)]";
const ENTER_TRANSITION = `transition-[opacity,transform,filter] duration-200 ${EASE_OUT} starting:opacity-0 starting:translate-y-1 starting:blur-[2px]`;

const appRouteApi = getRouteApi("/(app)");

type OnboardingDialogProps = {
  readonly renderTrigger: React.ReactElement;
  /** Only one mounted dialog may open on its own, for a new account or at the extension step after a reload, or two would stack. */
  readonly opensForNewAccount?: boolean;
};

function OnboardingDialog({ renderTrigger, opensForNewAccount = true }: OnboardingDialogProps) {
  const { session } = appRouteApi.useRouteContext();
  // Sessions from before the column existed have no key and count as onboarded.
  const isNewAccount = session.user.hasSeenOnboarding === false;
  const { reopenAtExtensionStep, setExtensionStepOpen } = useOnboarding();
  const reopensAtExtensionStep = opensForNewAccount && reopenAtExtensionStep;
  const [open, setOpen] = useState(opensForNewAccount && (isNewAccount || reopenAtExtensionStep));
  const [currentStep, setCurrentStep] = useState(
    reopensAtExtensionStep ? EXTENSION_STEP : FIRST_STEP,
  );

  const router = useRouter();
  const navigate = useNavigate();
  const { run: updateUser } = useResourceMutation(settings.updateUser);
  const sessionUsername = session.user.username ?? "";
  const sessionCurrency = session.user.currency as Currency;
  const sessionDateFormat = session.user.dateFormat as DateFormat;

  const currentMeta = STEPS.find((meta) => meta.step === currentStep) ?? STEPS[0];
  const isFirst = currentStep === FIRST_STEP;
  const isLast = currentStep === LAST_STEP;

  const atExtensionStep = open && currentMeta.id === "extension";
  const lastWrittenExtensionStep = useRef(atExtensionStep);
  useEffect(() => {
    if (lastWrittenExtensionStep.current === atExtensionStep) return;
    lastWrittenExtensionStep.current = atExtensionStep;
    setExtensionStepOpen(atExtensionStep);
  }, [atExtensionStep, setExtensionStepOpen]);

  const goToStep = useCallback((next: number) => {
    setCurrentStep(Math.min(Math.max(next, FIRST_STEP), LAST_STEP));
  }, []);

  const advance = useCallback(() => {
    goToStep(currentStep + 1);
  }, [currentStep, goToStep]);

  const form = useForm({
    defaultValues: {
      username: sessionUsername,
      currency: sessionCurrency,
      dateFormat: sessionDateFormat,
    },
    onSubmit: async ({ value }) => {
      const trimmedUsername = value.username.trim();
      const hasChanges =
        trimmedUsername !== sessionUsername ||
        value.currency !== sessionCurrency ||
        value.dateFormat !== sessionDateFormat;

      if (!hasChanges) {
        advance();
        return;
      }

      const updated = await updateUser({
        changes: {
          username: trimmedUsername,
          currency: value.currency,
          dateFormat: value.dateFormat,
        },
        fallback: "Couldn't save preferences.",
      });
      if (updated.isErr()) return;
      await router.invalidate();
      advance();
    },
    validators: {
      onSubmit: z.object({
        username: z
          .string()
          .min(MIN_USERNAME, `Username must be at least ${MIN_USERNAME} characters`)
          .max(MAX_USERNAME, `Username must be less than ${MAX_USERNAME} characters`),
        currency: z.enum(CURRENCIES),
        dateFormat: z.enum(DATE_FORMATS),
      }),
    },
  });

  const close = useCallback(async () => {
    setOpen(false);
    setCurrentStep(FIRST_STEP);
    if (!isNewAccount) return;
    await updateUser({ changes: { hasSeenOnboarding: true }, fallback: SAVE_FAILED });
  }, [isNewAccount, updateUser]);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) return close();
      form.reset({
        username: sessionUsername,
        currency: sessionCurrency,
        dateFormat: sessionDateFormat,
      });
      setOpen(true);
    },
    [close, form, sessionUsername, sessionCurrency, sessionDateFormat],
  );

  const handleBack = useCallback(() => {
    if (isFirst) return;
    goToStep(currentStep - 1);
  }, [isFirst, currentStep, goToStep]);

  const handleContinue = useCallback(async () => {
    if (currentMeta.id === "preferences") {
      await runSubmit(() => form.handleSubmit());
      return;
    }
    if (!isLast) {
      advance();
      return;
    }
    await close();
    await navigate({ to: "/add" });
  }, [currentMeta.id, isLast, form, advance, close, navigate]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={renderTrigger} />

      <DialogContent
        className="sm:max-w-xl gap-0 overflow-hidden p-0 bg-background/80 backdrop-blur-sm"
        showCloseButton={false}
      >
        <Stepper value={currentStep} onValueChange={setCurrentStep}>
          <StepperNav className="flex gap-1.5 px-6 pt-5">
            {STEPS.map((meta) => (
              <StepperItem key={meta.id} step={meta.step} className="flex-1 overflow-hidden">
                <StepperTrigger className="w-full" asChild>
                  <StepperIndicator
                    className={cn(
                      "h-1 w-full rounded-full! bg-muted",
                      `transition-colors duration-400 ${EASE_OUT}`,
                      "data-[state=active]:bg-foreground data-[state=completed]:bg-foreground",
                    )}
                  >
                    <span className="sr-only">{meta.eyebrow}</span>
                  </StepperIndicator>
                </StepperTrigger>
              </StepperItem>
            ))}
          </StepperNav>

          <StepperPanel className={cn("px-6 pt-5 pb-5", PANEL_MIN_HEIGHT)}>
            {STEPS.map((meta) => (
              <StepperContent
                key={meta.id}
                value={meta.step}
                className={cn("flex flex-col gap-5", ENTER_TRANSITION)}
              >
                <StepHeader meta={meta} />
                {meta.id === "preferences" ? (
                  <form onSubmit={formSubmitHandler(form)} className="flex flex-col gap-4">
                    <form.Field
                      name="username"
                      asyncDebounceMs={1000}
                      validators={{
                        onChangeAsync: async ({ value }) => {
                          if (value.length < MIN_USERNAME || value.length > MAX_USERNAME) return;
                          if (value === sessionUsername) return;
                          const checked = await decodeAuth(() =>
                            authClient.isUsernameAvailable({ username: value }),
                          );
                          if (checked.isErr()) return checked.error.message;
                          if (checked.value.available === false) return "Username is already taken";
                        },
                        onBlur: z
                          .string()
                          .min(MIN_USERNAME, `Username must be at least ${MIN_USERNAME} characters`)
                          .max(
                            MAX_USERNAME,
                            `Username must be less than ${MAX_USERNAME} characters`,
                          ),
                      }}
                    >
                      {(field) => (
                        <div className="flex flex-col gap-1.5">
                          <Label htmlFor={field.name}>Username</Label>
                          <Input
                            id={field.name}
                            name={field.name}
                            type="text"
                            autoComplete="username"
                            value={field.state.value}
                            onBlur={field.handleBlur}
                            onChange={(event) => field.handleChange(event.target.value)}
                            placeholder="Enter your username"
                            maxLength={MAX_USERNAME}
                          />
                          <FieldError className="text-xs" errors={field.state.meta.errors} />
                        </div>
                      )}
                    </form.Field>

                    <form.Field name="currency">
                      {(field) => (
                        <div className="flex flex-col gap-2">
                          <Label htmlFor={field.name}>Currency</Label>
                          <CurrencySelect
                            id={field.name}
                            value={field.state.value}
                            onValueChange={field.handleChange}
                            onBlur={field.handleBlur}
                            invalid={!field.state.meta.isValid}
                          />
                          <FieldError className="text-xs" errors={field.state.meta.errors} />
                        </div>
                      )}
                    </form.Field>

                    <form.Field name="dateFormat">
                      {(field) => (
                        <div className="flex flex-col gap-2">
                          <div className="flex flex-col gap-1">
                            <Label htmlFor={field.name}>Date format</Label>
                            <span className="text-xs text-muted-foreground">
                              e.g. {formatDateOnlyForDisplay(new Date(), field.state.value)}
                            </span>
                          </div>
                          <ToggleGroup
                            id={field.name}
                            variant="outline"
                            spacing={1}
                            value={[field.state.value]}
                            onValueChange={(next) => {
                              const [value] = next;
                              if (value) field.handleChange(value as DateFormat);
                            }}
                            className="flex-wrap"
                          >
                            {DATE_FORMATS.map((option) => (
                              <ToggleGroupItem key={option} value={option}>
                                {option}
                              </ToggleGroupItem>
                            ))}
                          </ToggleGroup>
                          <FieldError className="text-xs" errors={field.state.meta.errors} />
                        </div>
                      )}
                    </form.Field>
                  </form>
                ) : null}
                {meta.id === "extension" ? <ExtensionStep /> : null}
                {meta.id === "add" ? <AddStep /> : null}
              </StepperContent>
            ))}
          </StepperPanel>

          <form.Subscribe
            selector={(state) => ({
              isSubmitting: state.isSubmitting,
              canSubmit: state.canSubmit,
            })}
          >
            {({ isSubmitting, canSubmit }) => (
              <StepFooter
                isFirst={isFirst}
                isLast={isLast}
                isSaving={isSubmitting}
                canContinue={currentMeta.id !== "preferences" || canSubmit}
                onBack={handleBack}
                onContinue={handleContinue}
                onSkip={close}
              />
            )}
          </form.Subscribe>
        </Stepper>
      </DialogContent>
    </Dialog>
  );
}

type StepHeaderProps = {
  readonly meta: StepMeta;
};

function StepHeader({ meta }: StepHeaderProps) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="text-xs font-medium text-muted-foreground font-orbitron lowercase">
        {meta.eyebrow}
      </div>
      <DialogTitle className="tracking-tight text-xl leading-tight font-medium">
        {meta.title}
      </DialogTitle>
      <DialogDescription>{meta.description}</DialogDescription>
    </div>
  );
}

function AddStep() {
  return (
    <div className="flex flex-col gap-3 text-sm">
      <MissingExtensionNotice copyOf={pickExtensionCopy} />
      <ol className="flex list-decimal flex-col gap-2 pl-5 text-pretty">
        <li>Open an item on MyFigureCollection.</li>
        <li>
          Click <span className="font-medium">Pick for myakiba</span>, next to MFC&apos;s own
          buttons.
        </li>
        <li>Open the Add page, choose where your picks go and add them.</li>
      </ol>
      <p className="text-pretty text-muted-foreground">
        Items already in myakiba can be added from the Add page&apos;s search.
      </p>
    </div>
  );
}

type StepFooterProps = {
  readonly isFirst: boolean;
  readonly isLast: boolean;
  readonly isSaving: boolean;
  readonly canContinue: boolean;
  readonly onBack: () => void;
  readonly onContinue: () => void;
  readonly onSkip: () => void;
};

function StepFooter({
  isFirst,
  isLast,
  isSaving,
  canContinue,
  onBack,
  onContinue,
  onSkip,
}: StepFooterProps) {
  const getContinueIcon = () => {
    if (isSaving) return Loading03Icon;
    if (isLast) return Tick02Icon;
    return ArrowRight01Icon;
  };
  const continueIcon = getContinueIcon();
  const skipLabel = "Close";

  return (
    <div className="flex items-center justify-between gap-2 border-t bg-background px-4 py-3">
      <Button variant="ghost" size="sm" onClick={onSkip} disabled={isSaving}>
        {skipLabel}
      </Button>
      <div className="flex items-center gap-2">
        {!isFirst && (
          <Button variant="outline" size="sm" onClick={onBack} disabled={isSaving}>
            <HugeiconsIcon icon={ArrowLeft01Icon} data-icon="inline-start" strokeWidth={2} />
            Back
          </Button>
        )}
        <Button size="sm" onClick={onContinue} disabled={isSaving || !canContinue}>
          {isLast ? "Get started" : "Continue"}
          <HugeiconsIcon
            icon={continueIcon}
            data-icon="inline-end"
            strokeWidth={2}
            className={cn(isSaving && "animate-spin")}
          />
        </Button>
      </div>
    </div>
  );
}

export { OnboardingDialog };
