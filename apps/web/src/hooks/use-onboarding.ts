import { useCallback, useMemo } from "react";
import { useLocalStorage } from "@/hooks/use-local-storage";

const STORAGE_KEY = "myakiba:onboarding-v2";

type OnboardingState = {
  readonly step: number;
  readonly hasSeen: boolean;
  readonly completed: boolean;
};

const INITIAL_STATE: OnboardingState = {
  step: 0,
  hasSeen: false,
  completed: false,
};

function normalize(raw: OnboardingState, totalSteps: number): OnboardingState {
  const lastStepIndex = Math.max(totalSteps - 1, 0);
  const rawStep =
    typeof raw.step === "number" && Number.isFinite(raw.step) ? Math.trunc(raw.step) : 0;
  const step = Math.min(Math.max(rawStep, 0), lastStepIndex);
  const hasSeen = typeof raw.hasSeen === "boolean" ? raw.hasSeen : false;
  // Migration: earlier versions encoded completion as `step > lastStepIndex`
  // (past-the-end sentinel) without a dedicated flag.
  const completed = typeof raw.completed === "boolean" ? raw.completed : rawStep > lastStepIndex;
  return { step, hasSeen, completed };
}

type UseOnboardingOptions = {
  readonly totalSteps: number;
};

type UseOnboardingReturn = {
  readonly step: number;
  readonly hasSeen: boolean;
  readonly isCompleted: boolean;
  readonly setStep: (step: number) => void;
  readonly complete: () => void;
  readonly dismiss: () => void;
};

function useOnboarding({ totalSteps }: UseOnboardingOptions): UseOnboardingReturn {
  const [rawState, setState] = useLocalStorage<OnboardingState>(STORAGE_KEY, INITIAL_STATE);
  const state = useMemo(() => normalize(rawState, totalSteps), [rawState, totalSteps]);

  const setStep = useCallback(
    (step: number) => {
      setState((previous) => ({ ...previous, step, hasSeen: true }));
    },
    [setState],
  );

  const complete = useCallback(() => {
    setState((previous) => ({ ...previous, hasSeen: true, completed: true }));
  }, [setState]);

  const dismiss = useCallback(() => {
    setState((previous) => ({ ...previous, hasSeen: true }));
  }, [setState]);

  return {
    step: state.step,
    hasSeen: state.hasSeen,
    isCompleted: state.completed,
    setStep,
    complete,
    dismiss,
  } as const;
}

export { useOnboarding };
