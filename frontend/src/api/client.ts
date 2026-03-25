const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api";

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

export function apiFileUrl(fileId: string) {
  return `${API_BASE_URL}/files/${fileId}/download`;
}
