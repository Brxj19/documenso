import { AppError, AppErrorCode } from '@documenso/lib/errors/app-error';

type AllowlistEntry =
  | {
      type: 'origin';
      origin: string;
    }
  | {
      type: 'url';
      url: string;
    };

export const parseAbsoluteHttpUrl = (value: string, label: string) => {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new AppError(AppErrorCode.INVALID_BODY, {
      message: `${label} must be a valid absolute http or https URL.`,
    });
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new AppError(AppErrorCode.INVALID_BODY, {
      message: `${label} must use http or https.`,
    });
  }

  return url;
};

const parseAllowlistEntry = (value: string, label: string): AllowlistEntry => {
  const url = parseAbsoluteHttpUrl(value, label);

  if (!url.username && !url.password && url.pathname === '/' && !url.search && !url.hash) {
    return {
      type: 'origin',
      origin: url.origin,
    };
  }

  return {
    type: 'url',
    url: url.toString(),
  };
};

export const validateAbsoluteAllowlistedUrl = ({
  value,
  allowlistValues,
  label,
  allowlistErrorMessage,
}: {
  value?: string | null;
  allowlistValues: string[];
  label: string;
  allowlistErrorMessage: string;
}) => {
  if (!value) {
    return undefined;
  }

  if (allowlistValues.length === 0) {
    throw new AppError(AppErrorCode.INVALID_BODY, {
      message: `${label} is not configured for this environment.`,
    });
  }

  const allowlist = allowlistValues.map((entry) => parseAllowlistEntry(entry, label));
  const url = parseAbsoluteHttpUrl(value, label);
  const normalizedUrl = url.toString();

  const isAllowed = allowlist.some((entry) => {
    if (entry.type === 'origin') {
      return entry.origin === url.origin;
    }

    return entry.url === normalizedUrl;
  });

  if (!isAllowed) {
    throw new AppError(AppErrorCode.INVALID_BODY, {
      message: allowlistErrorMessage,
    });
  }

  return normalizedUrl;
};
