/**
 * ---------------------------------------------------------
 * RegLayer — DEV-ONLY: seed a working SSO connection (mocksaml)
 * ---------------------------------------------------------
 * WHY: Make SSO login testable locally without the manual /settings/sso +
 *      DNS-TXT dance. Creates a GA SAML connection against mocksaml.com and
 *      pre-verifies a test domain.
 * WHAT: workspace → ENTERPRISE; SSOConnection (registered in embedded Jackson);
 *      VerifiedDomain for `example.com`. Idempotent — re-running cleans the prior
 *      seed (app rows AND its Jackson registration) before creating a fresh one.
 * HOW:  npx tsx scripts/seed-sso-dev.ts
 *      Then sign in via "Continue with SSO" with any email @example.com.
 * CLEANUP: npx tsx scripts/seed-sso-dev.ts --remove
 *
 * Uses its own PrismaClient + @boxyhq controllers directly (NOT @/lib/sso/* or
 * @/lib/database/prisma — those import "server-only", which throws under tsx).
 * ---------------------------------------------------------
 */
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { controllers } from "@boxyhq/saml-jackson";

const DOMAIN = "example.com";
const METADATA_URL = "https://mocksaml.com/api/saml/metadata";
const PRODUCT = "reglayer";
const LABEL = "Dev mocksaml";

async function main() {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
  const appUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  const callback = `${appUrl}/api/auth/callback/boxyhq-saml`;
  const remove = process.argv.includes("--remove");

  // Boot Jackson up front — cleanup needs it too, not just registration.
  const jackson = await controllers({
    externalUrl: appUrl,
    samlPath: "/api/auth/sso/acs",
    oidcPath: "/api/auth/sso/oidc",
    samlAudience: process.env.SAML_AUDIENCE ?? "https://saml.reglayer.dev",
    db: { engine: "sql", type: "postgres", url: process.env.DATABASE_URL! },
  });

  try {
    // Remove every prior dev seed — BOTH the app rows AND their Jackson
    // registration. Jackson enforces IdP EntityID uniqueness across tenants, so a
    // leftover registration (e.g. from a re-run or a killed process) would block
    // re-seeding with "EntityID already exists for different tenant". The tenant
    // IS the SSOConnection id, so we can delete each Jackson connection by tenant.
    const priors = await prisma.sSOConnection.findMany({ where: { label: LABEL }, select: { id: true } });
    for (const p of priors) {
      await jackson.connectionAPIController.deleteConnections({ tenant: p.id, product: PRODUCT }).catch(() => {});
    }
    if (priors.length) {
      await prisma.sSOConnection.deleteMany({ where: { label: LABEL } }); // cascades domains/verified
      console.log(`removed ${priors.length} prior seed connection(s) + their Jackson registration(s)`);
    }
    if (remove) {
      await jackson.close?.();
      console.log("✅ removed (app rows + Jackson connections).");
      return;
    }

    const ws = await prisma.workspace.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true, name: true } });
    if (!ws) throw new Error("No workspace found — sign in once to create one, then re-run.");
    await prisma.workspace.update({ where: { id: ws.id }, data: { plan: "ENTERPRISE" } });
    console.log(`workspace "${ws.name}" (${ws.id}) → ENTERPRISE`);

    const conn = await prisma.sSOConnection.create({
      data: { workspaceId: ws.id, label: LABEL, protocol: "SAML", defaultRole: "MEMBER", rolloutStage: "GA", metadataUrl: METADATA_URL },
      select: { id: true },
    });

    console.log("registering with embedded Jackson…");
    const xml = await fetch(METADATA_URL).then((r) => r.text());
    await jackson.connectionAPIController.createSAMLConnection({
      tenant: conn.id,
      product: PRODUCT,
      rawMetadata: xml,
      defaultRedirectUrl: callback,
      redirectUrl: [callback],
    });
    await jackson.close?.();

    await prisma.ssoDomain.create({
      data: {
        connectionId: conn.id,
        workspaceId: ws.id,
        domain: DOMAIN,
        verificationStatus: "VERIFIED",
        verificationMethod: "DNS_TXT",
        verificationToken: "dev-seed",
        verifiedAt: new Date(),
        isPrimary: true,
      },
    });
    await prisma.verifiedDomain.create({ data: { domain: DOMAIN, workspaceId: ws.id, connectionId: conn.id } });

    console.log(`\n✅ Seeded SSO connection ${conn.id}`);
    console.log(`→ Sign out, click "Continue with SSO" with any email @${DOMAIN} (e.g. test@${DOMAIN}),`);
    console.log(`  submit at mocksaml, and you'll be JIT-provisioned back into "${ws.name}".`);
  } finally {
    await prisma.$disconnect();
  }
}

// Force exit — embedded Jackson leaves OpenTelemetry/grpc timers that otherwise
// keep the node event loop alive after the work is done.
main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("seed failed:", e);
    process.exit(1);
  });
