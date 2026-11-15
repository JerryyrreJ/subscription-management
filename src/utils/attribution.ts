export const ATTRIBUTION_STORAGE_KEY = 'steadyrenew:attribution-ref';
export const ATTRIBUTION_TTL_MS = 60 * 24 * 60 * 60 * 1000;

const ATTRIBUTION_REF_PATTERN = /^[a-z0-9][a-z0-9_-]{1,79}$/;
const BLOG_REFERRER_PATH_PATTERN = /^\/(zh\/)?blog(?:\/([a-z0-9-]+))?\/?$/;

type AttributionRecord = {
  ref: string;
  firstRef: string;
  capturedAt: number;
};

type StorageReader = Pick<Storage, 'getItem' | 'removeItem'>;
type StorageReadWriter = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function defaultStorage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function sanitizeAttributionRef(value?: string | null): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return ATTRIBUTION_REF_PATTERN.test(trimmed) ? trimmed : null;
}

export function deriveReferrerAttribution(
  referrer?: string | null,
  currentOrigin?: string
): string | null {
  if (!referrer) return null;
  let url: URL;
  try {
    url = new URL(referrer);
  } catch {
    return null;
  }

  const allowedHost =
    url.hostname === 'steadyrenew.com' ||
    (Boolean(currentOrigin) && url.origin === currentOrigin);
  if (!allowedHost) return null;

  const match = url.pathname.match(BLOG_REFERRER_PATH_PATTERN);
  if (!match) return null;

  const prefix = match[1] ? 'zh-blog-' : 'blog-';
  const slug = match[2] || 'index';
  return sanitizeAttributionRef(`${prefix}${slug}`);
}

function readValidRecord(storage: StorageReader | null, now: number): AttributionRecord | null {
  if (!storage) return null;
  let raw: string | null = null;
  try {
    raw = storage.getItem(ATTRIBUTION_STORAGE_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<AttributionRecord> | null;
    const ref = sanitizeAttributionRef(parsed?.ref);
    const firstRef = sanitizeAttributionRef(parsed?.firstRef) ?? ref;
    const capturedAt = parsed?.capturedAt;

    if (
      !ref ||
      !firstRef ||
      typeof capturedAt !== 'number' ||
      !Number.isFinite(capturedAt) ||
      capturedAt > now + 60_000 ||
      now - capturedAt > ATTRIBUTION_TTL_MS
    ) {
      storage.removeItem(ATTRIBUTION_STORAGE_KEY);
      return null;
    }

    return { ref, firstRef, capturedAt };
  } catch {
    try {
      storage.removeItem(ATTRIBUTION_STORAGE_KEY);
    } catch {
      // Ignore storage cleanup errors when storage is read-only.
    }
    return null;
  }
}

export function captureEntryAttribution(options?: {
  url?: string;
  referrer?: string;
  storage?: StorageReadWriter | null;
  replaceUrl?: (cleanPathAndSearchAndHash: string) => void;
  now?: number;
}): string | null {
  const urlString =
    options?.url ?? (typeof window !== 'undefined' ? window.location.href : undefined);
  if (!urlString) return null;

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(urlString);
  } catch {
    return null;
  }

  const storage =
    options && 'storage' in options ? (options.storage ?? null) : defaultStorage();
  const replaceUrl =
    options?.replaceUrl ??
    (typeof window !== 'undefined'
      ? (clean: string) => window.history.replaceState({}, '', clean)
      : undefined);
  const referrer =
    options?.referrer ?? (typeof document !== 'undefined' ? document.referrer : '');
  const now = options?.now ?? Date.now();

  const queryRef = sanitizeAttributionRef(parsedUrl.searchParams.get('ref'));
  if (queryRef && replaceUrl) {
    parsedUrl.searchParams.delete('ref');
    const nextSearch = parsedUrl.searchParams.toString();
    const cleanTarget = `${parsedUrl.pathname}${nextSearch ? `?${nextSearch}` : ''}${parsedUrl.hash}`;
    replaceUrl(cleanTarget);
  }

  const resolvedRef = queryRef ?? deriveReferrerAttribution(referrer, parsedUrl.origin);
  if (!resolvedRef) return null;

  const existing = readValidRecord(storage, now);
  if (storage) {
    try {
      const record: AttributionRecord = {
        ref: resolvedRef,
        firstRef: existing?.firstRef ?? resolvedRef,
        capturedAt: now,
      };
      storage.setItem(ATTRIBUTION_STORAGE_KEY, JSON.stringify(record));
    } catch {
      // Ignore storage write failures (e.g. private browsing quota restrictions).
    }
  }

  return resolvedRef;
}

export function getStoredAttributionRef(
  storage: StorageReader | null = defaultStorage(),
  now = Date.now()
): string | null {
  return readValidRecord(storage, now)?.ref ?? null;
}
