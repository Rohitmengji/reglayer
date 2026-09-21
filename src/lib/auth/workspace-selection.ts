import { cookies } from "next/headers";

export const WORKSPACE_COOKIE = "reglayer-workspace";

export async function readWorkspaceSelection(): Promise<string | null> {
  return (await cookies()).get(WORKSPACE_COOKIE)?.value || null;
}

export function selectWorkspaceMembership<Membership extends { workspaceId: string }>(
  memberships: Membership[],
  selectedId: string | null,
): Membership | null {
  return selectedId
    ? memberships.find((membership) => membership.workspaceId === selectedId) ?? null
    : memberships[0] ?? null;
}