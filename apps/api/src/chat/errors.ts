// Turning a thrown error into a response. Without this a failure anywhere
// below a route handler surfaces in the browser as a bare 500 with an empty
// body and nothing in the server console, which is a bad afternoon.
import type { ChatErrorCode } from "@grugchug/shared";

/**
 * A short, actionable sentence for the client. The full error is logged
 * server-side; storage is an embedded SQLite file with nothing external to
 * misconfigure or fail to reach, so there is no local setup mistake left
 * worth naming here.
 */
export function explainFailure(_cause: unknown): string {
  return "something went wrong on the server";
}

export function failureResponse(name: string, cause: unknown): Response {
  console.error(`chat: ${name} failed`, cause);
  const body: { error: ChatErrorCode; detail: string } = {
    error: "server_error",
    detail: explainFailure(cause),
  };
  return Response.json(body, { status: 500 });
}

/** Wraps a route handler so a rejection becomes a logged, readable 500. */
export function guard<Args extends unknown[], Result>(
  name: string,
  handler: (...args: Args) => Promise<Result>,
): (...args: Args) => Promise<Result | Response> {
  return async (...args) => {
    try {
      return await handler(...args);
    } catch (cause) {
      return failureResponse(name, cause);
    }
  };
}
