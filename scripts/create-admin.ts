/**
 * Creates an admin user. There is NO default account and NO default password.
 * Values come from environment variables so they never land in shell history or logs:
 *   ADMIN_EMAIL=... ADMIN_NAME=... ADMIN_PASSWORD=... [ADMIN_ROLE=SUPER_ADMIN] npm run admin:create
 * The password is never printed.
 */
import "dotenv/config";
import { PrismaClient, type Role } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { hashPassword, passwordProblems } from "../src/lib/auth/password";
import { ROLES } from "../src/lib/auth/rbac";

async function main() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const name = process.env.ADMIN_NAME?.trim();
  const password = process.env.ADMIN_PASSWORD ?? "";
  const role = (process.env.ADMIN_ROLE ?? "SUPER_ADMIN") as Role;
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("ADMIN_EMAIL is missing or invalid");
  if (!name) throw new Error("ADMIN_NAME is missing");
  if (!(ROLES as readonly string[]).includes(role)) throw new Error(`ADMIN_ROLE must be one of ${ROLES.join(", ")}`);
  const problems = passwordProblems(password);
  if (problems.length) throw new Error(`ADMIN_PASSWORD needs ${problems.join(" and ")}`);

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  try {
    const exists = await prisma.user.findUnique({ where: { email } });
    if (exists) throw new Error(`A user with ${email} already exists (not modified)`);
    const user = await prisma.user.create({ data: { email, name, role, passwordHash: await hashPassword(password) } });
    await prisma.auditLog.create({ data: { action: "user.create_cli", entityType: "User", entityId: user.id, after: { email, role } } });
    console.log(`Created ${role} ${email}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
