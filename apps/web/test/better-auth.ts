import { fireEvent, screen } from "@testing-library/react";

/** One request Better Auth's client sent, by its path under `/api/auth`. */
export type AuthRequest = { readonly path: string; readonly body: unknown };

type Respond = (request: AuthRequest) => Response | Promise<Response>;

const unanswered: Respond = ({ path }) => {
  throw new Error(`No answer for Better Auth's ${path}`);
};
let respond = unanswered;
let requests: AuthRequest[] = [];

// Better Auth's client keeps the fetch it finds when it is created, so a test imports this
// module before anything that creates the client.
globalThis.fetch = Object.assign(
  async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    const path = new URL(request.url).pathname.replace(/^\/api\/auth/u, "");
    const body: unknown = request.method === "GET" ? null : await request.json();
    const seen = { path, body };
    requests.push(seen);
    return respond(seen);
  },
  { preconnect: globalThis.fetch.preconnect },
);

/** Answers every Better Auth request with `answer`, and returns the requests it sees. */
export function answerAuth(answer: Respond): readonly AuthRequest[] {
  respond = answer;
  requests = [];
  return requests;
}

export function resetAuthAnswers() {
  respond = unanswered;
  requests = [];
}

/** Better Auth's refusal: a JSON body with its code and message, and the status line. */
export function refuse(
  status: number,
  statusText: string,
  body: { readonly code?: string; readonly message?: string } = {},
) {
  return Response.json(body, { status, statusText });
}

export function type(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}
