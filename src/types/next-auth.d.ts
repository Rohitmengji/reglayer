import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface User {
    role?: string;
    isMasterAdmin?: boolean;
    workspaceRole?: string | null;
    mustSetPassword?: boolean;
  }

  interface Session {
    user: {
      id?: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      role?: string;
      isMasterAdmin?: boolean;
      workspaceRole?: string | null;
      mustSetPassword?: boolean;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: string;
    isMasterAdmin?: boolean;
    workspaceRole?: string | null;
    mustSetPassword?: boolean;
  }
}
