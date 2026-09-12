// Turning a thrown error into a response. Without this a failure anywhere
// below a route handler surfaces in the browser as a bare 500 with an empty
// body and nothing in the server console, which is a bad afternoon.
import type { ChatErrorCode } from "@grugchug/shared";

/** Keep paths and raw errors in server logs; give storage setup guidance. */
export function explainFailure(cause: unknown): string {
  const code = cause && typeof cause === "object" && "code" in cause ? cause.code : undefined;
  if (
    typeof code === "string" &&
    ["SQLITE_CANTOPEN", "SQLITE_READONLY", "EACCES", "EPERM", "EROFS"].some(
      (known) => code === known || code.startsWith(`${known}_`),
    )
  ) {
    return "storage is not writable; check SQLITE_PATH and permissions on the database file and its directory";
  }
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
