import { PrismaClient } from "../generated/prisma";
import bcrypt from "bcrypt";
import { SYSTEM_PERMISSIONS, SYSTEM_ROLE_DEFINITIONS } from "../lib/rbac-config";

const prisma = new PrismaClient();

const DEFAULT_SUPPLIER_CATEGORIES = [
  {
    code: "APPAREL",
    name: "Apparel",
    description: "Garments, uniforms, fabric items, and stitched textile supply.",
  },
  {
    code: "PACKAGING",
    name: "Packaging",
    description: "Cartons, polybags, labels, wraps, and related packaging materials.",
  },
  {
    code: "ELECTRICAL",
    name: "Electrical",
    description: "Electrical goods, wiring items, fittings, and related maintenance supply.",
  },
  {
    code: "IT_EQUIPMENT",
    name: "IT Equipment",
    description: "Computers, networking devices, peripherals, and technology equipment.",
  },
  {
    code: "OFFICE_SUPPLIES",
    name: "Office Supplies",
    description: "Stationery, print consumables, filing, and day-to-day office materials.",
  },
  {
    code: "FURNITURE",
    name: "Furniture",
    description: "Office furniture, fixtures, storage, and workspace setup items.",
  },
  {
    code: "PRINTING",
    name: "Printing",
    description: "Printed materials, branding collateral, forms, and publication services.",
  },
  {
    code: "LOGISTICS_SERVICES",
    name: "Logistics Services",
    description: "Transport, courier, forwarding, and other delivery-related services.",
  },
  {
    code: "FACILITY_MAINTENANCE",
    name: "Facility Maintenance",
    description: "Repair, cleaning, maintenance, and facility support services.",
  },
  {
    code: "GENERAL_SERVICES",
    name: "General Services",
    description: "Professional or operational services not covered by a specific supply category.",
  },
] as const;

async function ensurePermissionsAndRoles() {
  for (const permission of SYSTEM_PERMISSIONS) {
    await prisma.permission.upsert({
      where: { key: permission.key },
      update: {
        description: permission.description,
      },
      create: {
        key: permission.key,
        description: permission.description,
      },
    });
  }

  for (const roleDef of SYSTEM_ROLE_DEFINITIONS) {
    const role = await prisma.role.upsert({
      where: { name: roleDef.name },
      update: {
        label: roleDef.label,
        description: roleDef.description,
        isSystem: true,
        isImmutable: roleDef.immutable,
      },
      create: {
        name: roleDef.name,
        label: roleDef.label,
        description: roleDef.description,
        isSystem: true,
        isImmutable: roleDef.immutable,
      },
    });

    const permissions = await prisma.permission.findMany({
      where: {
        key: { in: roleDef.permissions },
      },
      select: {
        id: true,
      },
    });

    await prisma.rolePermission.createMany({
      data: permissions.map((permission) => ({
        roleId: role.id,
        permissionId: permission.id,
      })),
      skipDuplicates: true,
    });
  }
}

async function ensureDefaultSupplierCategories(createdById?: string | null) {
  for (const category of DEFAULT_SUPPLIER_CATEGORIES) {
    await prisma.supplierCategory.upsert({
      where: { code: category.code },
      update: {
        name: category.name,
        description: category.description,
        isActive: true,
      },
      create: {
        code: category.code,
        name: category.name,
        description: category.description,
        isActive: true,
        createdById: createdById ?? null,
      },
    });
  }
}

async function main() {
  const adminEmail = "admin@example.com";
  const adminPassword = "admin123"; // change in production

  await ensurePermissionsAndRoles();

  const existingAdmin = await prisma.user.findUnique({ where: { email: adminEmail } });
  let admin = existingAdmin;

  if (!existingAdmin) {
    const hashedPassword = await bcrypt.hash(adminPassword, 10);
    admin = await prisma.user.create({
      data: {
        email: adminEmail,
        name: "Super Admin",
        role: "admin",
        passwordHash: hashedPassword,
        emailVerified: new Date(),
      },
    });
    console.log("✅ Admin created successfully");
    console.log({
      email: admin.email,
      password: adminPassword,
    });
  } else {
    console.log("✅ Admin already exists");
  }

  const superAdminRole = await prisma.role.findUnique({
    where: { name: "superadmin" },
    select: { id: true },
  });

  if (admin && superAdminRole) {
    const existingAssignment = await prisma.userRole.findFirst({
      where: {
        userId: admin.id,
        roleId: superAdminRole.id,
        scopeType: "GLOBAL",
      },
      select: { id: true },
    });

    if (!existingAssignment) {
      await prisma.userRole.create({
        data: {
          userId: admin.id,
          roleId: superAdminRole.id,
          scopeType: "GLOBAL",
        },
      });
    }
    console.log("✅ Superadmin role assigned to seed admin");
  }

  await ensureDefaultSupplierCategories(admin?.id ?? null);
  console.log("✅ Default supplier categories ensured");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
