/**
 * PM2 — KORNNE (Next.js 16, `next start`). TEMPLATE: never run on any server yet. No secrets in this file.
 * Adapted from Mezbaha-Teknolojileri/deploy/ecosystem.config.cjs (own code): separate app names, ports, dirs, users.
 *
 * One file, two isolated environments (each started by its OWN Unix user and PM2 daemon):
 *   production : user `kornne`         → /srv/kornne/current          → 127.0.0.1:3010   (app kornne-web)
 *   staging    : user `kornne-staging` → /srv/kornne-staging/current  → 127.0.0.1:3011   (app kornne-staging-web)
 * Usage (inside the release dir, as the matching user):
 *   KORNNE_ENV=production pm2 startOrReload deploy/ecosystem.config.cjs --update-env && pm2 save
 * Ports are proposals: deploy/scripts/preflight.sh must confirm they are free (`ss -ltn`) before the first start.
 * Secrets: <root>/shared/.env.production (chmod 600) symlinked into each release; Next loads it at start.
 */
const ENV = process.env.KORNNE_ENV === "staging" ? "staging" : "production";
const ROOT = ENV === "staging" ? "/srv/kornne-staging" : "/srv/kornne";
const APP_DIR = process.env.KORNNE_APP_DIR || `${ROOT}/current`;
const LOG_DIR = process.env.KORNNE_LOG_DIR || (ENV === "staging" ? "/var/log/kornne-staging" : "/var/log/kornne");
const PORT = process.env.KORNNE_PORT || (ENV === "staging" ? "3011" : "3010");

module.exports = {
  apps: [
    {
      name: ENV === "staging" ? "kornne-staging-web" : "kornne-web",
      cwd: APP_DIR,
      // next bin directly (not `npm start`) so PM2 signals reach the Node process
      script: "node_modules/next/dist/bin/next",
      args: `start --hostname 127.0.0.1 --port ${PORT}`,
      exec_mode: "fork",
      instances: 1,
      autorestart: true,
      max_restarts: 10,
      min_uptime: "20s",
      restart_delay: 3000,
      // small VPS: restart before the box swaps (measure real RSS on staging and adjust)
      max_memory_restart: ENV === "staging" ? "700M" : "1G",
      // graceful stop: Next finishes in-flight requests on SIGTERM; Nginx retries/serves maintenance meanwhile
      kill_timeout: 15000,
      listen_timeout: 30000,
      time: true,
      out_file: `${LOG_DIR}/out.log`,
      error_file: `${LOG_DIR}/error.log`,
      merge_logs: true,
      env: {
        NODE_ENV: "production",
        PORT,
        HOSTNAME: "127.0.0.1", // loopback only — reachable exclusively through Nginx
        NEXT_TELEMETRY_DISABLED: "1",
        // libuv pool for sharp/argon2 on small VPS (PestShield lesson: keep it bounded)
        UV_THREADPOOL_SIZE: "4",
        NODE_OPTIONS: ENV === "staging" ? "--max-old-space-size=512" : "--max-old-space-size=768",
      },
    },
  ],
};
