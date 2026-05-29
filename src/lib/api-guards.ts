export const DEFAULT_JSON_BODY_LIMIT_BYTES = 512 * 1024;

type ReadUtf8StreamOptions = {
  missingMessage?: string;
  missingStatus?: number;
  tooLargeMessage?: string;
  tooLargeStatus?: number;
};

export class ApiRouteError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiRouteError";
    this.status = status;
  }
}

export function isApiRouteError(error: unknown): error is ApiRouteError {
  return error instanceof ApiRouteError;
}

export function getSafeRouteErrorDetails(
  error: unknown,
  fallbackMessage: string,
  fallbackStatus = 500,
) {
  if (isApiRouteError(error)) {
    return {
      message: error.message,
      status: error.status,
    };
  }

  return {
    message: fallbackMessage,
    status: fallbackStatus,
  };
}

export function getContentLength(headers: Headers) {
  const raw = headers.get("content-length");

  if (!raw) {
    return null;
  }

  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export function assertContentLengthWithinLimit(
  headers: Headers,
  maxBytes: number,
  tooLargeMessage: string,
  tooLargeStatus = 413,
) {
  const contentLength = getContentLength(headers);

  if (contentLength !== null && contentLength > maxBytes) {
    throw new ApiRouteError(tooLargeStatus, tooLargeMessage);
  }
}

export async function readUtf8StreamWithLimit(
  stream: ReadableStream<Uint8Array> | null,
  maxBytes: number,
  options: ReadUtf8StreamOptions = {},
) {
  const {
    missingMessage = "Request body is required.",
    missingStatus = 400,
    tooLargeMessage = "Request body is too large.",
    tooLargeStatus = 413,
  } = options;

  if (!stream) {
    throw new ApiRouteError(missingStatus, missingMessage);
  }

  const reader = stream.getReader();
  const decoder = new TextDecoder("utf-8");
  let totalBytes = 0;
  let decoded = "";

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      if (!value) {
        continue;
      }

      totalBytes += value.byteLength;

      if (totalBytes > maxBytes) {
        throw new ApiRouteError(tooLargeStatus, tooLargeMessage);
      }

      decoded += decoder.decode(value, { stream: true });
    }

    decoded += decoder.decode();
  } finally {
    reader.releaseLock();
  }

  if (!decoded.trim()) {
    throw new ApiRouteError(missingStatus, missingMessage);
  }

  return decoded;
}

export async function readJsonWithLimit<T>(
  request: Request,
  maxBytes = DEFAULT_JSON_BODY_LIMIT_BYTES,
) {
  assertContentLengthWithinLimit(
    request.headers,
    maxBytes,
    "Request body is too large. Shorten the content and try again.",
  );

  const raw = await readUtf8StreamWithLimit(request.body, maxBytes, {
    missingMessage: "Request body is required.",
    tooLargeMessage: "Request body is too large. Shorten the content and try again.",
  });

  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new ApiRouteError(400, "Request body must be valid JSON.");
  }
}
