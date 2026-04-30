import { VatClassDetailSection } from "@/components/admin/VatClassDetailReport";
import { notFound } from "next/navigation";

export default async function VatClassReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ dateFrom?: string; dateTo?: string }>;
}) {
  const { id } = await params;
  const filters = searchParams ? await searchParams : undefined;
  const vatClassId = Number(id);

  if (!Number.isInteger(vatClassId) || vatClassId <= 0) {
    notFound();
  }

  return (
    <VatClassDetailSection
      id={vatClassId}
      dateFrom={filters?.dateFrom}
      dateTo={filters?.dateTo}
    />
  );
}
