/**
 * ---------------------------------------------------------
 * RegLayer — Reset Google User Script
 * ---------------------------------------------------------
 *
 * WHY: Development utility for testing OAuth onboarding flows.
 * When testing Google login, you need a clean slate.
 *
 * WHAT: Deletes all data for a Google OAuth user so they
 * can go through the onboarding flow again.
 *
 * HOW: Run with `npx tsx scripts/reset-google-user.ts`
 * Deletes: workspace memberships, scans, workspaces, user record.
 * ---------------------------------------------------------
 */

import 'dotenv/config';
import { prisma } from '../src/lib/database/prisma';

async function main() {
  const user = await prisma.user.findUnique({ 
    where: { email: 'rohitmengjih@gmail.com' },
    include: { memberships: true }
  });
  
  if (!user) { 
    console.log('Google user not found in DB'); 
    return; 
  }
  
  console.log('Google user:', user.id, user.email);
  console.log('Memberships:', user.memberships.length);
  
  // Remove all memberships so we can test the request flow
  if (user.memberships.length > 0) {
    for (const m of user.memberships) {
      await prisma.workspaceMember.delete({ where: { id: m.id } });
      console.log('Removed membership:', m.id, m.role);
    }
  }
  
  // Also clear any existing access requests
  await prisma.accessRequest.deleteMany({ where: { userId: user.id } });
  console.log('Cleared access requests');
  console.log('Done - Google user has no workspace access');
}

main().then(() => process.exit(0));
