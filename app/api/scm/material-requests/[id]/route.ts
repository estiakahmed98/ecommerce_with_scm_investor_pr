import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { Prisma } from "@/generated/prisma";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAccessContext } from "@/lib/rbac";
import { logActivity } from "@/lib/activity-log";
import {
  materialRequestInclude,
  toMaterialRequestLogSnapshot,
} from "@/lib/material-warehouse";

const MATERIAL_REQUEST_READ_PERMISSIONS = [
  "material_requests.read",
  "material_requests.manage",
  "material_requests.endorse_supervisor",
  "material_requests.endorse_project_manager",
  "material_requests.approve_admin",
  "material_releases.read",
  "material_releases.manage",
] as const;

function toCleanText(value: unknown, max = 500) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function canReadMaterialRequest(access: Awaited<ReturnType<typeof getAccessContext>>) {
  return access.hasAny([...MATERIAL_REQUEST_READ_PERMISSIONS]);
}

function canUpdateDraft(
  access: Awaited<ReturnType<typeof getAccessContext>>,
  materialRequest: Prisma.MaterialRequestGetPayload<{ include: typeof materialRequestInclude }>,
) {
  return access.can("material_requests.manage", materialRequest.warehouseId);
}

function canCancel(
  access: Awaited<ReturnType<typeof getAccessContext>>,
  materialRequest: Prisma.MaterialRequestGetPayload<{ include: typeof materialRequestInclude }>,
) {
  return (
    access.can("material_requests.manage", materialRequest.warehouseId) ||
    materialRequest.createdById === access.userId
  );
}

function canReject(
  access: Awaited<ReturnType<typeof getAccessContext>>,
  warehouseId: number,
) {
  return (
    access.can("material_requests.endorse_supervisor", warehouseId) ||
    access.can("material_requests.endorse_project_manager", warehouseId) ||
    access.can("material_requests.approve_admin", warehouseId)
  );
}

function parseAttachmentInput(raw: unknown) {
  const row = raw as {
    fileUrl?: unknown;
    fileName?: unknown;
    mimeType?: unknown;
    fileSize?: unknown;
    note?: unknown;
  };
  const fileUrl = toCleanText(row.fileUrl, 600);
  const fileName = toCleanText(row.fileName, 255);
  if (!fileUrl || !fileName) {
    throw new Error("Attachment file URL and file name are required.");
  }
  if (!fileUrl.startsWith("/api/upload/scm-material/")) {
    throw new Error("Attachment file URL is outside material document upload scope.");
  }
  const fileSizeRaw =
    row.fileSize === undefined || row.fileSize === null || row.fileSize === ""
      ? null
      : Number(row.fileSize);
  if (fileSizeRaw !== null && (!Number.isInteger(fileSizeRaw) || fileSizeRaw < 0)) {
    throw new Error("Attachment file size is invalid.");
  }

  return {
    fileUrl,
    fileName,
    mimeType: toCleanText(row.mimeType, 160) || null,
    fileSize: fileSizeRaw,
    note: toCleanText(row.note, 255) || null,
  };
}

type MaterialRequestApprovalStage =
  | "SUBMISSION"
  | "SUPERVISOR_ENDORSEMENT"
  | "PROJECT_MANAGER_ENDORSEMENT"
  | "ADMIN_APPROVAL"
  | "REJECTION"
  | "CANCELLATION";

type MaterialRequestApprovalDecision = "APPROVED" | "REJECTED" | "CANCELLED";

async function appendApprovalEvent(
  tx: Prisma.TransactionClient,
  materialRequestId: number,
  stage: MaterialRequestApprovalStage,
  decision: MaterialRequestApprovalDecision,
  actedById: string,
  note?: string | null,
) {
  await tx.materialRequestApprovalEvent.create({
    data: {
      materialRequestId,
      stage,
      decision,
      actedById,
      note: note || null,
    },
  });
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const materialRequestId = Number(id);
    if (!Number.isInteger(materialRequestId) || materialRequestId <= 0) {
      return NextResponse.json({ error: "Invalid material request id." }, { status: 400 });
    }

    const session = await getServerSession(authOptions);
    const access = await getAccessContext(
      session?.user as { id?: string; role?: string } | undefined,
    );
    if (!access.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!canReadMaterialRequest(access)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const materialRequest = await prisma.materialRequest.findUnique({
      where: { id: materialRequestId },
      include: materialRequestInclude,
    });
    if (!materialRequest) {
      return NextResponse.json({ error: "Material request not found." }, { status: 404 });
    }
    if (!access.canAccessWarehouse(materialRequest.warehouseId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json(materialRequest);
  } catch (error) {
    console.error("SCM MATERIAL REQUEST GET ERROR:", error);
    return NextResponse.json({ error: "Failed to load material request." }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const materialRequestId = Number(id);
    if (!Number.isInteger(materialRequestId) || materialRequestId <= 0) {
      return NextResponse.json({ error: "Invalid material request id." }, { status: 400 });
    }

    const session = await getServerSession(authOptions);
    const access = await getAccessContext(
      session?.user as { id?: string; role?: string } | undefined,
    );
    if (!access.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const materialRequest = await prisma.materialRequest.findUnique({
      where: { id: materialRequestId },
      include: materialRequestInclude,
    });
    if (!materialRequest) {
      return NextResponse.json({ error: "Material request not found." }, { status: 404 });
    }
    if (!access.canAccessWarehouse(materialRequest.warehouseId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (!canReadMaterialRequest(access)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const action = toCleanText(body.action, 80).toLowerCase();
    const before = toMaterialRequestLogSnapshot(materialRequest);

    if (!action) {
      if (!canUpdateDraft(access, materialRequest)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      if (materialRequest.status !== "DRAFT") {
        return NextResponse.json(
          { error: "Only draft material requests can be edited." },
          { status: 400 },
        );
      }

      const requiredBy =
        body.requiredBy === undefined
          ? undefined
          : body.requiredBy
            ? new Date(String(body.requiredBy))
            : null;
      if (requiredBy instanceof Date && Number.isNaN(requiredBy.getTime())) {
        return NextResponse.json({ error: "Required-by date is invalid." }, { status: 400 });
      }

      const updated = await prisma.materialRequest.update({
        where: { id: materialRequest.id },
        data: {
          title:
            body.title === undefined ? undefined : toCleanText(body.title, 160) || null,
          purpose:
            body.purpose === undefined
              ? undefined
              : toCleanText(body.purpose, 500) || null,
          budgetCode:
            body.budgetCode === undefined
              ? undefined
              : toCleanText(body.budgetCode, 120) || null,
          boqReference:
            body.boqReference === undefined
              ? undefined
              : toCleanText(body.boqReference, 160) || null,
          specification:
            body.specification === undefined
              ? undefined
              : toCleanText(body.specification, 1200) || null,
          note:
            body.note === undefined ? undefined : toCleanText(body.note, 1000) || null,
          requiredBy,
        },
        include: materialRequestInclude,
      });

      await logActivity({
        action: "update",
        entity: "material_request",
        entityId: updated.id,
        access,
        request,
        metadata: {
          message: `Updated material request ${updated.requestNumber}`,
        },
        before,
        after: toMaterialRequestLogSnapshot(updated),
      });

      return NextResponse.json(updated);
    }

    if (action === "add_attachment") {
      if (
        !access.can("material_requests.manage", materialRequest.warehouseId) &&
        materialRequest.createdById !== access.userId
      ) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }

      const attachment = parseAttachmentInput(body);
      const updated = await prisma.$transaction(async (tx) => {
        await tx.materialRequestAttachment.create({
          data: {
            materialRequestId: materialRequest.id,
            ...attachment,
            uploadedById: access.userId,
          },
        });
        return tx.materialRequest.findUniqueOrThrow({
          where: { id: materialRequest.id },
          include: materialRequestInclude,
        });
      });

      await logActivity({
        action: "add_attachment",
        entity: "material_request",
        entityId: updated.id,
        access,
        request,
        metadata: {
          message: `Added attachment to material request ${updated.requestNumber}`,
        },
        before,
        after: toMaterialRequestLogSnapshot(updated),
      });

      return NextResponse.json(updated);
    }

    if (action === "submit") {
      if (!access.can("material_requests.manage", materialRequest.warehouseId)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      if (materialRequest.status !== "DRAFT") {
        return NextResponse.json(
          { error: "Only draft material requests can be submitted." },
          { status: 400 },
        );
      }
      const updated = await prisma.$transaction(async (tx) => {
        const next = await tx.materialRequest.update({
          where: { id: materialRequest.id },
          data: {
            status: "SUBMITTED",
            submittedAt: new Date(),
          },
          include: materialRequestInclude,
        });
        await appendApprovalEvent(
          tx,
          materialRequest.id,
          "SUBMISSION",
          "APPROVED",
          access.userId!,
          toCleanText(body.note, 1000) || null,
        );
        return next;
      });

      await logActivity({
        action: "submit",
        entity: "material_request",
        entityId: updated.id,
        access,
        request,
        metadata: { message: `Submitted material request ${updated.requestNumber}` },
        before,
        after: toMaterialRequestLogSnapshot(updated),
      });
      return NextResponse.json(updated);
    }

    if (action === "endorse_supervisor") {
      if (!access.can("material_requests.endorse_supervisor", materialRequest.warehouseId)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      if (materialRequest.status !== "SUBMITTED") {
        return NextResponse.json(
          { error: "Supervisor endorsement is allowed only for submitted requests." },
          { status: 400 },
        );
      }

      const updated = await prisma.$transaction(async (tx) => {
        const next = await tx.materialRequest.update({
          where: { id: materialRequest.id },
          data: {
            status: "SUPERVISOR_ENDORSED",
            supervisorEndorsedAt: new Date(),
            supervisorEndorsedById: access.userId,
          },
          include: materialRequestInclude,
        });
        await appendApprovalEvent(
          tx,
          materialRequest.id,
          "SUPERVISOR_ENDORSEMENT",
          "APPROVED",
          access.userId!,
          toCleanText(body.note, 1000) || null,
        );
        return next;
      });

      await logActivity({
        action: "endorse_supervisor",
        entity: "material_request",
        entityId: updated.id,
        access,
        request,
        metadata: { message: `Supervisor-endorsed ${updated.requestNumber}` },
        before,
        after: toMaterialRequestLogSnapshot(updated),
      });
      return NextResponse.json(updated);
    }

    if (action === "endorse_project_manager") {
      if (
        !access.can(
          "material_requests.endorse_project_manager",
          materialRequest.warehouseId,
        )
      ) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      if (materialRequest.status !== "SUPERVISOR_ENDORSED") {
        return NextResponse.json(
          { error: "Project manager endorsement is allowed only after supervisor endorsement." },
          { status: 400 },
        );
      }

      const updated = await prisma.$transaction(async (tx) => {
        const next = await tx.materialRequest.update({
          where: { id: materialRequest.id },
          data: {
            status: "PROJECT_MANAGER_ENDORSED",
            projectManagerEndorsedAt: new Date(),
            projectManagerEndorsedById: access.userId,
          },
          include: materialRequestInclude,
        });
        await appendApprovalEvent(
          tx,
          materialRequest.id,
          "PROJECT_MANAGER_ENDORSEMENT",
          "APPROVED",
          access.userId!,
          toCleanText(body.note, 1000) || null,
        );
        return next;
      });

      await logActivity({
        action: "endorse_project_manager",
        entity: "material_request",
        entityId: updated.id,
        access,
        request,
        metadata: { message: `Project-manager-endorsed ${updated.requestNumber}` },
        before,
        after: toMaterialRequestLogSnapshot(updated),
      });
      return NextResponse.json(updated);
    }

    if (action === "approve_admin") {
      if (!access.can("material_requests.approve_admin", materialRequest.warehouseId)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      if (materialRequest.status !== "PROJECT_MANAGER_ENDORSED") {
        return NextResponse.json(
          { error: "Admin approval is allowed only after project manager endorsement." },
          { status: 400 },
        );
      }

      const updated = await prisma.$transaction(async (tx) => {
        const next = await tx.materialRequest.update({
          where: { id: materialRequest.id },
          data: {
            status: "ADMIN_APPROVED",
            adminApprovedAt: new Date(),
            adminApprovedById: access.userId,
          },
          include: materialRequestInclude,
        });
        await appendApprovalEvent(
          tx,
          materialRequest.id,
          "ADMIN_APPROVAL",
          "APPROVED",
          access.userId!,
          toCleanText(body.note, 1000) || null,
        );
        return next;
      });

      await logActivity({
        action: "approve_admin",
        entity: "material_request",
        entityId: updated.id,
        access,
        request,
        metadata: { message: `Admin-approved material request ${updated.requestNumber}` },
        before,
        after: toMaterialRequestLogSnapshot(updated),
      });
      return NextResponse.json(updated);
    }

    if (action === "reject") {
      if (!canReject(access, materialRequest.warehouseId)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      if (
        !["SUBMITTED", "SUPERVISOR_ENDORSED", "PROJECT_MANAGER_ENDORSED"].includes(
          materialRequest.status,
        )
      ) {
        return NextResponse.json(
          { error: "Only in-review material requests can be rejected." },
          { status: 400 },
        );
      }

      const updated = await prisma.$transaction(async (tx) => {
        const next = await tx.materialRequest.update({
          where: { id: materialRequest.id },
          data: {
            status: "REJECTED",
            rejectedAt: new Date(),
            rejectedById: access.userId,
          },
          include: materialRequestInclude,
        });
        await appendApprovalEvent(
          tx,
          materialRequest.id,
          "REJECTION",
          "REJECTED",
          access.userId!,
          toCleanText(body.note, 1000) || null,
        );
        return next;
      });

      await logActivity({
        action: "reject",
        entity: "material_request",
        entityId: updated.id,
        access,
        request,
        metadata: { message: `Rejected material request ${updated.requestNumber}` },
        before,
        after: toMaterialRequestLogSnapshot(updated),
      });
      return NextResponse.json(updated);
    }

    if (action === "cancel") {
      if (!canCancel(access, materialRequest)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      if (!["DRAFT", "SUBMITTED"].includes(materialRequest.status)) {
        return NextResponse.json(
          { error: "Only draft or submitted material requests can be cancelled." },
          { status: 400 },
        );
      }

      const updated = await prisma.$transaction(async (tx) => {
        const next = await tx.materialRequest.update({
          where: { id: materialRequest.id },
          data: {
            status: "CANCELLED",
          },
          include: materialRequestInclude,
        });
        await appendApprovalEvent(
          tx,
          materialRequest.id,
          "CANCELLATION",
          "CANCELLED",
          access.userId!,
          toCleanText(body.note, 1000) || null,
        );
        return next;
      });

      await logActivity({
        action: "cancel",
        entity: "material_request",
        entityId: updated.id,
        access,
        request,
        metadata: { message: `Cancelled material request ${updated.requestNumber}` },
        before,
        after: toMaterialRequestLogSnapshot(updated),
      });
      return NextResponse.json(updated);
    }

    return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
  } catch (error: any) {
    console.error("SCM MATERIAL REQUEST PATCH ERROR:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to update material request." },
      { status: 500 },
    );
  }
}
