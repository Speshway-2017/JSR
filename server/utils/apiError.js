/** Map low-level Mongo errors to a user-facing message for the desktop app. */
export function apiErrorMessage(error, fallback = 'Something went wrong') {
  const msg = error?.message || String(error || '');
  if (
    error?.name === 'MongoServerSelectionError' ||
    error?.name === 'MongoNetworkError' ||
    /ECONNREFUSED|buffering timed out|topology was destroyed|failed to connect/i.test(msg)
  ) {
    return 'Database connection lost. Close JSR fully, wait a few seconds, then open it again.';
  }
  return msg || fallback;
}
