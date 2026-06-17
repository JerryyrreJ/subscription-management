const SENSITIVE_KEY = /(authorization|token|secret|password|device.?key|service.?role|key.?prefix|api.?key.?prefix)/i;
const EMAIL_KEY = /email/i;

export const maskEmail = (email?: string | null): string | undefined => {
  if (!email) {
    return undefined;
  }

  const [localPart, domain] = email.split('@');
  if (!domain) {
    return '<invalid-email>';
  }

  return `${localPart.slice(0, 1)}***@${domain}`;
};

export const sanitizeLogDetails = (
  details: Record<string, unknown>
): Record<string, unknown> => {
  const sanitizeValue = (key: string, value: unknown): unknown => {
    if (SENSITIVE_KEY.test(key)) {
      return '<redacted>';
    }

    if (EMAIL_KEY.test(key) && typeof value === 'string') {
      return maskEmail(value);
    }

    if (Array.isArray(value)) {
      return value.map(item => sanitizeValue('', item));
    }

    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value).map(([nestedKey, nestedValue]) => [
          nestedKey,
          sanitizeValue(nestedKey, nestedValue),
        ])
      );
    }

    return value;
  };

  return Object.fromEntries(
    Object.entries(details).map(([key, value]) => [key, sanitizeValue(key, value)])
  );
};

export const logEvent = (
  level: 'info' | 'warn' | 'error',
  message: string,
  requestId: string,
  details: Record<string, unknown> = {}
): void => {
  const payload = {
    requestId,
    message,
    ...sanitizeLogDetails(details),
  };

  console[level](JSON.stringify(payload));
};
