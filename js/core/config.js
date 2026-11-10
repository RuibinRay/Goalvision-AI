/**
 * Deployment configuration. No secrets live here: API keys stay in the backend's environment variables.
 * Set `backend` to your deployed worker (see backend/worker/README.md) to switch the site from DEMO to LIVE.
 * A visitor can also set it for their own browser in My Dashboard → Data connection.
 */
export const CONFIG = {
  backend: 'https://goalvision-api.goalvision-api.workers.dev',   // the deployed worker; '' forces DEMO mode
  repo: 'https://github.com/RuibinRay/Goalvision-AI',   // source link in the footer; '' hides it
  liveRefreshSeconds: 60,            // lower bound; the backend may ask for a slower cadence
};
export const NAV = [
  ['/', 'Home'], ['/live', 'Live'], ['/leagues', 'Leagues'], ['/clubs', 'Clubs'], ['/players', 'Players'], ['/predictions', 'Predictions'],
  ['/compare', 'Compare'], ['/tactics', 'Tactics Lab'], ['/datalab', 'Data Lab'], ['/learn', 'Learn'], ['/history', 'History'], ['/dashboard', 'My Dashboard'],
];
