const rawApiBase = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim();
const apiBase = rawApiBase ? rawApiBase.replace(/\/+$/, "") : "";

function shouldRewritePath(path: string): boolean {
  return path.startsWith("/api");
}

function rewriteUrl(input: string | URL): string {
  const raw = typeof input === "string" ? input : input.toString();
  if (!apiBase) return raw;

  if (/^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(raw)) {
    return raw;
  }

  return shouldRewritePath(raw) ? `${apiBase}${raw}` : raw;
}

// Route all relative /api requests to the deployed backend base URL, and attach Bearer tokens
const originalFetch = globalThis.fetch.bind(globalThis);
globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
  let url = typeof input === "string" || input instanceof URL ? input : input.url;
  url = rewriteUrl(url);

  const newInit = { ...init };
  const token = localStorage.getItem("token");
  
  // Only attach Bearer token to our own API
  const isApiRequest = (apiBase && url.startsWith(apiBase)) || shouldRewritePath(url) || url.startsWith("/");
  
  if (token && isApiRequest) {
    const existingHeaders = input instanceof Request ? Object.fromEntries(input.headers.entries()) : {};
    const initHeaders = init?.headers ? (init.headers instanceof Headers ? Object.fromEntries(init.headers.entries()) : init.headers) : {};
    
    newInit.headers = {
      ...existingHeaders,
      ...initHeaders,
      Authorization: `Bearer ${token}`,
    };
  }

  if (input instanceof Request) {
    // If input is a Request, passing newInit overrides its properties
    return originalFetch(new Request(url, newInit), newInit);
  }
  return originalFetch(url, newInit);
}) as typeof globalThis.fetch;

if (typeof globalThis.EventSource !== "undefined") {
  const NativeEventSource = globalThis.EventSource;
  globalThis.EventSource = class extends NativeEventSource {
    constructor(url: string | URL, eventSourceInitDict?: EventSourceInit) {
      let finalUrl = rewriteUrl(url);
      const token = localStorage.getItem("token");
      if (token) {
        finalUrl += (finalUrl.includes("?") ? "&" : "?") + `token=${token}`;
      }
      super(finalUrl, eventSourceInitDict);
    }
  } as typeof EventSource;
}

export function toApiUrl(path: string): string {
  return rewriteUrl(path);
}
