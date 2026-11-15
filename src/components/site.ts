// Role B. Site-wide settings that are not data. Nothing here is a hard-coded address:
// the repository URL comes from the environment, so a fork or a renamed repository needs no code change.

function clean(url: string | undefined): string | null {
  const value = url?.trim().replace(/\/+$/, '');
  return value && /^https:\/\//i.test(value) ? value : null;
}

/**
 * Public repository URL, or null when it is not configured (pages then name the files without linking).
 * 1. NEXT_PUBLIC_REPO_URL, set by hand (see .env.example).
 * 2. On Vercel, built from the system variables of the connected Git repository.
 */
export const REPO_URL: string | null =
  clean(process.env.NEXT_PUBLIC_REPO_URL) ??
  (process.env.VERCEL_GIT_PROVIDER === 'github' && process.env.VERCEL_GIT_REPO_OWNER && process.env.VERCEL_GIT_REPO_SLUG
    ? `https://github.com/${process.env.VERCEL_GIT_REPO_OWNER}/${process.env.VERCEL_GIT_REPO_SLUG}`
    : null);

/** Link to a file in the repository's default view, or null when the repository is not configured. */
export function repoFile(path: string): string | null {
  return REPO_URL ? `${REPO_URL}/blob/HEAD/${path}` : null;
}
