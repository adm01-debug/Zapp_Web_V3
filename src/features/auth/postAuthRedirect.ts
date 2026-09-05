export const POST_AUTH_REDIRECT_STORAGE_KEY = 'zapp.auth.next';

type LocationLike = {
  pathname: string;
  search?: string;
  hash?: string;
};

export function sanitizePostAuthTarget(raw: string | null | undefined): string | null {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return null;
  return raw;
}

export function buildPostAuthTargetPath(location: LocationLike): string {
  return `${location.pathname}${location.search ?? ''}${location.hash ?? ''}` || '/';
}

export function rememberPostAuthTarget(location: LocationLike): string {
  const target = buildPostAuthTargetPath(location);
  try {
    sessionStorage.setItem(POST_AUTH_REDIRECT_STORAGE_KEY, target);
  } catch {
    // noop
  }
  return target;
}

export function readStoredPostAuthTarget(): string | null {
  try {
    return sanitizePostAuthTarget(sessionStorage.getItem(POST_AUTH_REDIRECT_STORAGE_KEY));
  } catch {
    return null;
  }
}

export function clearStoredPostAuthTarget() {
  try {
    sessionStorage.removeItem(POST_AUTH_REDIRECT_STORAGE_KEY);
  } catch {
    // noop
  }
}

export function buildAuthRedirectTarget(location: LocationLike, reason?: string): string {
  const params = new URLSearchParams();
  if (reason) params.set('reason', reason);
  params.set('next', rememberPostAuthTarget(location));
  return `/auth?${params.toString()}`;
}
