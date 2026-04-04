const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api";

export type ApiDownloadPayload = {
  blob: Blob;
  filename: string;
  contentType: string;
};

function buildHeaders(init?: RequestInit) {
  if (init?.body instanceof FormData) {
    return init.headers;
  }

  return {
    "Content-Type": "application/json",
    ...(init?.headers ?? {}),
  };
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    credentials: "include",
    ...init,
    headers: buildHeaders(init),
  });

  if (!response.ok) {
    let message = "请求失败";
    try {
      const payload = await response.json();
      message = Array.isArray(payload.message) ? payload.message.join("，") : payload.message || message;
    } catch {
      message = response.statusText || message;
    }
    throw new Error(message);
  }

  const contentType = response.headers.get("Content-Type") ?? "";
  if (!contentType.includes("application/json")) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

function parseDownloadFilename(contentDisposition: string | null, fallbackPath: string) {
  if (contentDisposition) {
    const filenameStarMatch = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
    if (filenameStarMatch?.[1]) {
      return decodeURIComponent(filenameStarMatch[1]);
    }

    const filenameMatch = contentDisposition.match(/filename="?([^";]+)"?/i);
    if (filenameMatch?.[1]) {
      return filenameMatch[1];
    }
  }

  const lastSegment = fallbackPath.split("/").filter(Boolean).pop();
  return lastSegment || "download";
}

export async function apiDownload(path: string, init?: RequestInit): Promise<ApiDownloadPayload> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    credentials: "include",
    ...init,
    headers: buildHeaders(init),
  });

  if (!response.ok) {
    let message = "请求失败";
    try {
      const payload = await response.json();
      message = Array.isArray(payload.message) ? payload.message.join("，") : payload.message || message;
    } catch {
      try {
        message = (await response.text()) || response.statusText || message;
      } catch {
        message = response.statusText || message;
      }
    }
    throw new Error(message);
  }

  return {
    blob: await response.blob(),
    filename: parseDownloadFilename(response.headers.get("Content-Disposition"), path),
    contentType: response.headers.get("Content-Type") || "application/octet-stream",
  };
}

export function apiFileUrl(fileId: string) {
  return `${API_BASE_URL}/files/${fileId}/download`;
}
