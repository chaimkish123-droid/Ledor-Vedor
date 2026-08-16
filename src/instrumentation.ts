/**
 * Runs once when the server starts.
 *
 * Scheduled backups live here rather than in a cron job so that a small
 * deployment — one container, one volume — protects itself without anyone
 * having to remember to set that up.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { startScheduledBackups } = await import('./lib/backup');
  startScheduledBackups();
}
