import type { Theme } from "@/components/stageshow/kit";

/** Every demo takes the page's resolved theme so its stage matches the app. */
export interface DemoProps {
  readonly theme: Theme;
}
