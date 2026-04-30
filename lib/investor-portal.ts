import type { AccessContext } from "@/lib/rbac";
import { getAccessContext } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";

type SessionUser =
  | {
      id?: string;
      role?: string;
    }
  | null
  | undefined;

export const INVESTOR_PORTAL_PERMISSION = "investor.portal.access" as const;

export type InvestorPortalContext = {
  access: AccessContext;
  investorPortalAccessId: string;
  investorId: number;
  investorCode: string;
  investorName: string;
  userId: string;
};

export type InvestorPortalResolution =
  | { ok: true; context: InvestorPortalContext }
  | {
      ok: false;
      status: 401 | 403 | 500;
      error: string;
      access: AccessContext;
    };

export async function resolveInvestorPortalContext(
  sessionUser: SessionUser,
): Promise<InvestorPortalResolution> {
  try {
    // Step 1: Get access context
    const access = await getAccessContext(
      sessionUser as { id?: string; role?: string } | undefined,
    );

    // Step 2: Check if user is authenticated
    if (!access.userId) {
      return {
        ok: false,
        status: 401,
        error: "Unauthorized - Please login to access investor portal",
        access,
      };
    }

    // Step 3: Check if user has investor portal permission
    if (!access.has(INVESTOR_PORTAL_PERMISSION)) {
      return {
        ok: false,
        status: 403,
        error:
          "Investor portal permission is missing for this account. Please contact administrator.",
        access,
      };
    }

    // Step 4: Check Prisma client availability
    if (!prisma) {
      return {
        ok: false,
        status: 500,
        error: "Database connection error. Please try again later.",
        access,
      };
    }

    // Step 5: Check if InvestorPortalAccess model exists
    if (!prisma.investorPortalAccess) {
      return {
        ok: false,
        status: 500,
        error:
          "Investor portal access model is not configured. Please contact support.",
        access,
      };
    }

    // Step 6: Fetch portal access record
    const portalAccess = await prisma.investorPortalAccess.findFirst({
      where: {
        userId: access.userId,
        status: "ACTIVE",
        investor: {
          status: "ACTIVE",
        },
      },
      select: {
        id: true,
        investor: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
      },
    });

    // Step 7: Check if portal access exists
    if (!portalAccess) {
      return {
        ok: false,
        status: 403,
        error:
          "Investor portal is not configured for this user. Ask an administrator to assign investor portal access.",
        access,
      };
    }

    // Step 8: Return success response
    return {
      ok: true,
      context: {
        access,
        investorPortalAccessId: portalAccess.id,
        investorId: portalAccess.investor.id,
        investorCode: portalAccess.investor.code,
        investorName: portalAccess.investor.name,
        userId: access.userId,
      },
    };
  } catch (error) {
    console.error("Error resolving investor portal context:", error);

    // Create a basic access context for error response
    const fallbackAccess = await getAccessContext(
      sessionUser as { id?: string; role?: string } | undefined,
    );

    return {
      ok: false,
      status: 500,
      error:
        error instanceof Error
          ? error.message
          : "An unexpected error occurred while accessing investor portal",
      access: fallbackAccess,
    };
  }
}

// Helper function to check if user has portal access (simpler version)
export async function hasInvestorPortalAccess(
  sessionUser: SessionUser,
): Promise<boolean> {
  const result = await resolveInvestorPortalContext(sessionUser);
  return result.ok;
}

// Helper function to get portal context or throw
export async function requireInvestorPortalContext(
  sessionUser: SessionUser,
): Promise<InvestorPortalContext> {
  const result = await resolveInvestorPortalContext(sessionUser);
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result.context;
}
