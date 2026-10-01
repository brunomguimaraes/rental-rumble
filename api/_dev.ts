// Local-dev-only switches. scripts/dev-api.ts sets VERCEL_ENV=development (so
// does `vercel dev`); Vercel's own builds set production or preview. Read
// lazily so a missing value is simply false.

/** True only under local dev; dev-only actions answer 404 everywhere else. */
export function isLocalDev(): boolean {
  return process.env.VERCEL_ENV === 'development';
}
