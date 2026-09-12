// Shared conductor HTTP transport: distinguish connectivity from server errors.
interface ResponseParser<T> {
  parse: (value: unknown) => T;
}

export class ConductorApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
    this.name = "ConductorApiError";
  }
}

export async function request<T>(
  path: string,
  schema: ResponseParser<T>,
  init: RequestInit = {},
  fetchFn: typeof fetch = fetch,
): Promise<T> {
  let res: Response;
  try {
    res = await fetchFn(`/api${path}`, {
      ...init,
      headers: { "content-type": "application/json", ...init.headers },
    });
  } catch {
    throw new ConductorApiError(
      "Cannot reach the study server. Start bun run dev from the project root, then try again.",
      0,
    );
  }

  if (res.status === 502 || res.status === 503) {
    throw new ConductorApiError(
      "The study server is unavailable. Start bun run dev from the project root, then try again.",
      res.status,
    );
  }
  if (res.status === 504) {
    throw new ConductorApiError(
      "The study server took too long to respond. Please try again.",
      res.status,
    );
  }

  if (!res.ok) {
    const detail = await res
      .json()
      .then(
        (body: { error?: string; detail?: string }) =>
          [body.error, body.detail].filter(Boolean).join(": ") || undefined,
      )
      .catch(() => undefined);
    throw new ConductorApiError(detail ?? `request failed (${res.status})`, res.status);
  }
  return schema.parse(await res.json());
}
