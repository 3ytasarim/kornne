import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { DESTRUCTIVE, scanMigrations } from "../../scripts/release/check-migrations.mjs";

/** Sprint 11 — guard rails on the deployment templates (they are never executed in this repository). */
const read = (p: string) => readFileSync(p, "utf8");
const directives = (conf: string) => conf.split(/\r?\n/).map((l) => l.replace(/#.*$/, "")).join("\n");
const require = createRequire(import.meta.url);

describe("Nginx templates", () => {
  for (const f of ["deploy/nginx/kornne-production.conf.example", "deploy/nginx/kornne-staging.conf.example"]) {
    it(`${f}: no default_server, kornne-prefixed zones/upstreams, loopback upstream`, () => {
      const c = directives(read(f));
      expect(c).not.toMatch(/default_server/);
      for (const z of c.match(/zone=([a-z_]+)/g) ?? []) expect(z).toMatch(/^zone=kornne_/);
      for (const u of c.match(/upstream ([a-z_]+)/g) ?? []) expect(u).toMatch(/^upstream kornne_/);
      expect(c).toMatch(/server 127\.0\.0\.1:30(10|11)/);
      expect(c).toMatch(/ssl_protocols TLSv1\.2 TLSv1\.3/);
    });
  }
  it("production: http and www go to https://kornne.com in one 301; staging is private + noindex", () => {
    const p = directives(read("deploy/nginx/kornne-production.conf.example"));
    expect(p.match(/return 301 https:\/\/kornne\.com\$request_uri/g)).toHaveLength(2);
    const s = directives(read("deploy/nginx/kornne-staging.conf.example"));
    expect(s).toMatch(/auth_basic "KORNNE staging"/);
    expect(s).toMatch(/X-Robots-Tag "noindex, nofollow, noimageindex" always/);
  });
});

describe("PM2 + environment templates", () => {
  it("staging and production are separate apps, ports, dirs and logs", () => {
    const load = (env: string) => {
      process.env.KORNNE_ENV = env;
      delete require.cache[require.resolve("../../deploy/ecosystem.config.cjs")];
      return require("../../deploy/ecosystem.config.cjs").apps[0];
    };
    const prod = load("production");
    const stg = load("staging");
    delete process.env.KORNNE_ENV;
    expect(prod.name).not.toBe(stg.name);
    expect(prod.env.PORT).not.toBe(stg.env.PORT);
    expect(prod.cwd).not.toBe(stg.cwd);
    expect(prod.out_file).not.toBe(stg.out_file);
    expect(prod.env.HOSTNAME).toBe("127.0.0.1");
  });
  it("env templates hold no secrets and keep every switch OFF", () => {
    for (const f of ["deploy/env/production.env.example", "deploy/env/staging.env.example", ".env.example"]) {
      const kv = Object.fromEntries(read(f).split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.split("=")[0], l.slice(l.indexOf("=") + 1)]));
      for (const k of ["DATABASE_URL", "DIRECT_URL", "IP_HASH_SALT", "STAGING_BASIC_AUTH_PASSWORD", "GOOGLE_SERVICE_ACCOUNT_KEY_FILE"]) expect(kv[k] ?? "", `${f} ${k}`).toBe("");
      for (const k of ["SITE_INDEXABLE", "MERCHANT_API_ENABLED", "ANALYTICS_ENABLED", "ENABLE_PAID_CHECKOUT", "SECRETS_ROTATION_CONFIRMED"]) expect(kv[k], `${f} ${k}`).toBe("false");
      expect(read(f)).not.toMatch(/npg_|postgres(ql)?:\/\/[^\s]*:[^\s@]+@/);
    }
  });
});

describe("release scripts", () => {
  it("release.sh is a dry run by default and refuses --execute without written approval", () => {
    const dry = spawnSync("bash", ["deploy/scripts/release.sh", "--ref", "abc123"], { encoding: "utf8", env: { ...process.env, KORNNE_ENV: "staging", KORNNE_RELEASE_APPROVED: "" } });
    expect(dry.status).toBe(0);
    expect(dry.stdout).toContain("mode: DRY-RUN");
    expect(dry.stdout).toContain("dry run — nothing changed");
    const exec = spawnSync("bash", ["deploy/scripts/release.sh", "--ref", "abc123", "--execute"], { encoding: "utf8", env: { ...process.env, KORNNE_ENV: "staging", KORNNE_RELEASE_APPROVED: "" } });
    expect(exec.status).toBe(3);
    expect(exec.stdout).toContain("REFUSED");
  });
  it("all migrations are additive; the gate recognises destructive SQL", () => {
    expect(scanMigrations().filter((m) => m.destructive.length)).toEqual([]);
    const hit = (sql: string) => DESTRUCTIVE.some((re: RegExp) => re.test(sql));
    expect(hit('ALTER TABLE "Price" DROP COLUMN "amountMinor";')).toBe(true);
    expect(hit('TRUNCATE "Product";')).toBe(true);
    expect(hit('ALTER TABLE "X" ALTER COLUMN "y" SET NOT NULL;')).toBe(true);
    expect(hit('ALTER TABLE "MerchantSyncRun" ADD COLUMN "status" TEXT;')).toBe(false);
  });
});
