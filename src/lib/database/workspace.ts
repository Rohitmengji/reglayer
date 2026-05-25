import { prisma } from "@/lib/database/prisma";

/**
 * Get or create a default workspace for a user.
 * Returns the workspaceId.
 */
export async function getOrCreateWorkspace(userId: string, email: string): Promise<string> {
  // Check if user already has a workspace membership
  const membership = await prisma.workspaceMember.findFirst({
    where: { userId },
    select: { workspaceId: true },
  });

  if (membership) {
    return membership.workspaceId;
  }

  // Create a default workspace for the user
  const slug = email.split("@")[0].replace(/[^a-z0-9-]/gi, "-").toLowerCase();
  const workspace = await prisma.workspace.create({
    data: {
      name: `${email.split("@")[0]}'s Workspace`,
      slug: `${slug}-${Date.now().toString(36)}`,
      members: {
        create: {
          userId,
          role: "OWNER",
        },
      },
    },
  });

  return workspace.id;
}
