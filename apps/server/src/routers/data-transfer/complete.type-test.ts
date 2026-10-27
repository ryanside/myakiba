import type { ExtensionImportUnavailable } from "@/lib/errors/extension-import-unavailable";
import type { UploadNotInRunningImport } from "./errors/upload-not-in-running-import";
/**
 * dataTransfer.completeItem answers an unreadable page with one of the MFC page messages.
 * Its 400 was typed as string; better-result types it as their literals. The wire is the same.
 */
import type { ElysiaCustomStatusResponse as S } from "elysia";
import { serve } from "@/domain/kernel";
import type { PROBLEM_MESSAGE } from "@/lib/errors/mfc-page-rejected";
import { DataTransfer } from "./module";

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type InputOf<O> = O extends { readonly "~types"?: { readonly input: (input: infer I) => void } }
  ? I
  : never;
declare const caller: Parameters<typeof serve>[0];
declare function inputOf<O>(op: O): InputOf<O>;

const complete = () => serve(caller, DataTransfer.complete, inputOf(DataTransfer.complete));
type Answer = Awaited<ReturnType<typeof complete>>;
type Failures = Answer extends infer A
  ? A extends S<infer _C, infer _T, infer _S>
    ? A
    : never
  : never;

void (true satisfies Equal<
  Failures,
  | S<400, (typeof PROBLEM_MESSAGE)[keyof typeof PROBLEM_MESSAGE]>
  | S<409, ExtensionImportUnavailable["message"]>
  | S<409, UploadNotInRunningImport["message"]>
  | S<500, "Failed to import the item.">
>);
