import type { Prisma, PrismaClient } from "@/generated/prisma";
import type { PermissionKey } from "@/lib/rbac-config";

const DELIVERY_MAN_ROLE_NAME = "delivery_man";

const DELIVERY_MAN_PERMISSION_DEFINITIONS = [
  {
    key: "delivery.dashboard.access",
    description: "Access delivery-man assignment and operational dashboard flows.",
  },
] as const satisfies ReadonlyArray<{
  key: PermissionKey;
  description: string;
}>;

const DELIVERY_MAN_ROLE_PERMISSIONS: PermissionKey[] = [
  "delivery.dashboard.access",
  "profile.manage",
];

type DeliveryManAccessClient =
  | Pick<
      PrismaClient,
      "permission" | "role" | "rolePermission" | "warehouseMembership" | "userRole"
    >
  | Pick<
      Prisma.TransactionClient,
      "permission" | "role" | "rolePermission" | "warehouseMembership" | "userRole"
    >;

export async function ensureDeliveryManRoleArtifacts(client: DeliveryManAccessClient) {
  await Promise.all(
    DELIVERY_MAN_PERMISSION_DEFINITIONS.map((permission) =>
      client.permission.upsert({
        where: { key: permission.key },
        update: {
          description: permission.description,
        },
        create: {
          key: permission.key,
          description: permission.description,
        },
      }),
    ),
  );

  const role = await client.role.upsert({
    where: { name: DELIVERY_MAN_ROLE_NAME },
    update: {
      label: "Delivery Man",
      description: "Delivery execution role for assigned shipment handling.",
      isSystem: true,
      isImmutable: false,
    },
    create: {
      name: DELIVERY_MAN_ROLE_NAME,
      label: "Delivery Man",
      description: "Delivery execution role for assigned shipment handling.",
      isSystem: true,
      isImmutable: false,
    },
  });

  const permissions = await client.permission.findMany({
    where: {
      key: {
        in: DELIVERY_MAN_ROLE_PERMISSIONS,
      },
    },
    select: {
      id: true,
    },
  });

  await client.rolePermission.createMany({
    data: permissions.map((permission) => ({
      roleId: role.id,
      permissionId: permission.id,
    })),
    skipDuplicates: true,
  });

  return role;
}

export async function syncDeliveryManWarehouseAccess(
  client: DeliveryManAccessClient,
  input: {
    userId: string;
    warehouseId: number;
    assignedById?: string | null;
  },
) {
  const role = await ensureDeliveryManRoleArtifacts(client);

  await client.warehouseMembership.updateMany({
    where: {
      userId: input.userId,
      warehouseId: {
        not: input.warehouseId,
      },
    },
    data: {
      isPrimary: false,
      status: "INACTIVE",
    },
  });

  await client.warehouseMembership.upsert({
    where: {
      userId_warehouseId: {
        userId: input.userId,
        warehouseId: input.warehouseId,
      },
    },
    update: {
      isPrimary: true,
      status: "ACTIVE",
      assignedById: input.assignedById ?? null,
    },
    create: {
      userId: input.userId,
      warehouseId: input.warehouseId,
      isPrimary: true,
      status: "ACTIVE",
      assignedById: input.assignedById ?? null,
    },
  });

  await client.userRole.deleteMany({
    where: {
      userId: input.userId,
      roleId: role.id,
      scopeType: "WAREHOUSE",
      warehouseId: {
        not: input.warehouseId,
      },
    },
  });

  await client.userRole.upsert({
    where: {
      userId_roleId_scopeType_warehouseId: {
        userId: input.userId,
        roleId: role.id,
        scopeType: "WAREHOUSE",
        warehouseId: input.warehouseId,
      },
    },
    update: {
      assignedById: input.assignedById ?? null,
    },
    create: {
      userId: input.userId,
      roleId: role.id,
      scopeType: "WAREHOUSE",
      warehouseId: input.warehouseId,
      assignedById: input.assignedById ?? null,
    },
  });

  return role;
}
