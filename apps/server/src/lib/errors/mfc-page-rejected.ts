import type { MfcPageProblem } from "@myakiba/mfc/parse";
import { Failure } from "@/domain/failure";

/** What the client is told about each page the server cannot ingest. */
const PROBLEM_MESSAGE = {
  challenge: "MyFigureCollection showed a security check instead of the item",
  not_found: "MyFigureCollection did not show this item",
  not_an_item_page: "The page is not a MyFigureCollection item page",
  wrong_item: "The page is for a different item",
  sfw_hidden: "Turn off SFW mode in your MyFigureCollection menu to save this NSFW item",
  missing_title: "The item page has no title",
  missing_category: "The item page has no category",
  unsupported_category: "This item category is not supported",
} as const satisfies Record<MfcPageProblem["kind"], string>;

/** An uploaded MFC item page the server cannot ingest, answered as a 400 that names why. */
export class MfcPageRejected extends Failure(
  "MfcPageRejected",
  "bad_request",
  (props: { readonly problem: MfcPageProblem["kind"] }) => PROBLEM_MESSAGE[props.problem],
) {}
