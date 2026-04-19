import { useCallback, useMemo } from "react";
import { useLocalStorage } from "@/hooks/use-local-storage";

const STORAGE_KEY = "myakiba:onboarding-v2";
const TOTAL_STEPS = 4;

type OnboardingState = {
  readonly step: number;
  readonly hasSeen: boolean;
};

const INITIAL_STATE: OnboardingState = {
  step: 0,
  hasSeen: false,
};

function normalize(raw: OnboardingState): OnboardingState {
  const step =
    typeof raw.step === "number" && Number.isFinite(raw.step)
      ? Math.min(Math.max(Math.trunc(raw.step), 0), TOTAL_STEPS)
      : 0;
  const hasSeen = typeof raw.hasSeen === "boolean" ? raw.hasSeen : false;
  return { step, hasSeen };
}

type UseOnboardingReturn = {
  readonly step: number;
  readonly hasSeen: boolean;
  readonly isCompleted: boolean;
  readonly setStep: (step: number) => void;
  readonly complete: () => void;
  readonly dismiss: () => void;
  readonly reset: () => void;
};

function useOnboarding(): UseOnboardingReturn {
  const [rawState, setState] = useLocalStorage<OnboardingState>(STORAGE_KEY, INITIAL_STATE);
  const state = useMemo(() => normalize(rawState), [rawState]);

  const setStep = useCallback(
    (step: number) => {
      setState((previous) => ({ ...previous, step, hasSeen: true }));
    },
    [setState],
  );

  const complete = useCallback(() => {
    setState({ step: TOTAL_STEPS, hasSeen: true });
  }, [setState]);

  const dismiss = useCallback(() => {
    setState((previous) => ({ ...previous, hasSeen: true }));
  }, [setState]);

  const reset = useCallback(() => {
    setState(INITIAL_STATE);
  }, [setState]);

  return {
    step: state.step,
    hasSeen: state.hasSeen,
    isCompleted: state.step >= TOTAL_STEPS,
    setStep,
    complete,
    dismiss,
    reset,
  } as const;
}

export { useOnboarding, TOTAL_STEPS };
