import { useState } from "react";
import type { ComponentType, ReactElement } from "react";

import type { DotMatrixCommonProps } from "@/lib/dotmatrix-core";
import { DotmCircular2 } from "@/components/ui/dotm-circular-2";
import { DotmCircular5 } from "@/components/ui/dotm-circular-5";
import { DotmSquare11 } from "@/components/ui/dotm-square-11";
import { DotmCircular6 } from "@/components/ui/dotm-circular-6";
import { DotmCircular7 } from "@/components/ui/dotm-circular-7";
import { DotmSquare14 } from "@/components/ui/dotm-square-14";
import { DotmSquare20 } from "@/components/ui/dotm-square-20";

type DotmVariant = ComponentType<DotMatrixCommonProps>;

const DOTM_VARIANTS: readonly [DotmVariant, ...DotmVariant[]] = [
  DotmCircular2,
  DotmCircular5,
  DotmSquare11,
  DotmSquare14,
  DotmSquare20,
  DotmCircular6,
  DotmCircular7,
] as const;

function randomDotmVariant(): DotmVariant {
  const [firstVariant] = DOTM_VARIANTS;
  const variantIndex = Math.floor(Math.random() * DOTM_VARIANTS.length);
  return DOTM_VARIANTS[variantIndex] ?? firstVariant;
}

export type DotmRandomProps = DotMatrixCommonProps;

export function DotmRandom(props: DotmRandomProps): ReactElement {
  const [Component] = useState<DotmVariant>(() => randomDotmVariant());
  return <Component {...props} />;
}
