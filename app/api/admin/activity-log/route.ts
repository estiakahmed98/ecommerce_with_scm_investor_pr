import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAccessContext } from "@/lib/rbac";
import {
  canAccessActivityEntity,
  getVisibleActivityEntities,
  hasFullActivityLogAccess,
  isInvestorActivityEntity,
  logActivity,
} from "@/lib/activity-log";

function toPositiveInt(value: string | null, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.floor(parsed);
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const access = await getAccessContext(
      session?.user as { id?: string; role?: string } | undefined,
    );

    if (!access.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (
      !access.hasAny([
        "settings.activitylog.read",
        "settings.manage",
        "investor.activity_log.read",
      ])
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const url = new URL(request.url);
    const page = toPositiveInt(url.searchParams.get("page"), 1);
    const pageSize = Math.min(toPositiveInt(url.searchParams.get("pageSize"), 20), 100);
    const search = url.searchParams.get("search")?.trim() || "";
    const requestedEntity = url.searchParams.get("entity")?.trim() || "";
    const scope = url.searchParams.get("scope")?.trim() || "";
    const investorOnlyScope = scope === "investor";
    const fullAccess = hasFullActivityLogAccess(access);

    if (investorOnlyScope && requestedEntity && !isInvestorActivityEntity(requestedEntity)) {
      return NextResponse.json({
        logs: [],
        total: 0,
        page,
        pageSize,
        entities: [],
        fullAccess,
      });
    }

    if (requestedEntity && !canAccessActivityEntity(access, requestedEntity)) {
      return NextResponse.json({
        logs: [],
        total: 0,
        page,
        pageSize,
        entities: fullAccess ? [] : getVisibleActivityEntities(access),
        fullAccess,
      });
    }

    const visibleEntities = fullAccess ? [] : getVisibleActivityEntities(access);
    const where: Record<string, unknown> = {
      NOT: {
        entity: "activity_log",
      },
    };

    const scopedEntityFilters = investorOnlyScope
      ? [
          {
            entity: {
              startsWith: "investor",
            },
          },
        ]
      : [];

    if (requestedEntity) {
      where.entity = requestedEntity.toLowerCase();
    } else if (!fullAccess || investorOnlyScope) {
      const baseFilters = !fullAccess
        ? visibleEntities.map((entity) => ({
            entity: {
              startsWith: entity.toLowerCase(),
            },
          }))
        : [];

      const combinedFilters = [...baseFilters, ...scopedEntityFilters];

      if (combinedFilters.length === 0) {
        return NextResponse.json({
          logs: [],
          total: 0,
          page,
          pageSize,
          entities: [],
          fullAccess: false,
        });
      }

      if (baseFilters.length === 0 && investorOnlyScope) {
        where.OR = scopedEntityFilters;
      } else {
        where.AND = [
          ...(Array.isArray(where.AND) ? (where.AND as unknown[]) : []),
          {
            OR: baseFilters.length > 0 ? baseFilters : scopedEntityFilters,
          },
          ...(investorOnlyScope
            ? [
                {
                  OR: scopedEntityFilters,
                },
              ]
            : []),
        ];
      }

      if (!fullAccess && visibleEntities.length === 0) {
        return NextResponse.json({
          logs: [],
          total: 0,
          page,
          pageSize,
          entities: [],
          fullAccess: false,
        });
      }
    }

    if (search) {
      where.AND = [
        ...(Array.isArray(where.AND) ? (where.AND as unknown[]) : []),
        {
          OR: [
            { action: { contains: search, mode: "insensitive" } },
            { entity: { contains: search.toLowerCase() } },
            { entityId: { contains: search, mode: "insensitive" } },
            { user: { is: { email: { contains: search, mode: "insensitive" } } } },
            { user: { is: { name: { contains: search, mode: "insensitive" } } } },
          ],
        },
      ];
    }

    const distinctWhere = requestedEntity
      ? { entity: requestedEntity.toLowerCase() }
      : investorOnlyScope
        ? {
            OR: scopedEntityFilters,
          }
        : !fullAccess && visibleEntities.length > 0
          ? {
              OR: visibleEntities.map((entity) => ({
                entity: {
                  startsWith: entity.toLowerCase(),
                },
              })),
            }
          : undefined;

    const [rows, total, distinctEntities] = await Promise.all([
      prisma.activityLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
            },
          },
        },
      }),
      prisma.activityLog.count({ where }),
      prisma.activityLog.findMany({
        where: distinctWhere,
        distinct: ["entity"],
        select: { entity: true },
        orderBy: { entity: "asc" },
      }),
    ]);

    return NextResponse.json({
      logs: rows.map((row) => ({
        id: row.id.toString(),
        userId: row.userId,
        action: row.action,
        entity: row.entity,
        entityId: row.entityId,
        metadata: row.metadata,
        ipHash: row.ipHash,
        userAgent: row.userAgent,
        createdAt: row.createdAt,
        updatetAt: row.updatetAt,
        user: row.user,
      })),
      total,
      page,
      pageSize,
      entities: distinctEntities.map((item) => item.entity),
      fullAccess,
    });
  } catch (error) {
    console.error("ACTIVITY LOG GET ERROR:", error);
    return NextResponse.json(
      { error: "Failed to load activity logs." },
      { status: 500 },
    );
  }
}
