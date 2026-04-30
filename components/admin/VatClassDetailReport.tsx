import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PdfExportButton } from "@/components/admin/PdfExportButton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getVatClassDetailReport } from "@/lib/vat-report";

function fmtMoney(value: number) {
  return new Intl.NumberFormat("en-BD", {
    style: "currency",
    currency: "BDT",
    maximumFractionDigits: 2,
  }).format(value || 0);
}

function fmtNumber(value: number) {
  return new Intl.NumberFormat("en-BD").format(value || 0);
}

function formatDateLabel(value: string) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function MetricCard({
  title,
  value,
  hint,
  className = "",
}: {
  title: string;
  value: string;
  hint: string;
  className?: string;
}) {
  return (
    <Card className={`overflow-hidden border-border/70 ${className}`}>
      <div className="h-1 bg-gradient-to-r from-primary via-primary/70 to-transparent" />
      <CardHeader className="pb-3">
        <CardDescription className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          {title}
        </CardDescription>
        <CardTitle className="text-2xl font-semibold">{value}</CardTitle>
      </CardHeader>
      <CardContent className="pt-0 text-sm text-muted-foreground">
        {hint}
      </CardContent>
    </Card>
  );
}

export async function VatClassDetailSection({
  id,
  dateFrom,
  dateTo,
}: {
  id: number;
  dateFrom?: string;
  dateTo?: string;
}) {
  const report = await getVatClassDetailReport(id, {
    from: dateFrom || null,
    to: dateTo || null,
  });

  if (!report) {
    notFound();
  }

  return (
    <section className="space-y-6">
      <div className="rounded-3xl border border-border/70 bg-gradient-to-br from-background via-muted/40 to-background p-6 shadow-sm">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-4">
            <Badge variant="outline" className="w-fit bg-background/80">
              Single VAT Class Report
            </Badge>
            <div className="space-y-2">
              <h1 className="text-3xl font-semibold tracking-tight">
                {report.vatClass.name}
              </h1>
              <p className="text-sm text-muted-foreground">
                Code: {report.vatClass.code}
              </p>
              <p className="max-w-3xl text-sm text-muted-foreground">
                {report.vatClass.description || "No class description set."}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary" className="px-3 py-1">
                {dateFrom || dateTo
                  ? `Range: ${dateFrom ? formatDateLabel(dateFrom) : "All"} to ${
                      dateTo ? formatDateLabel(dateTo) : "All"
                    }`
                  : "Range: All dates"}
              </Badge>
              <Badge variant="outline" className="px-3 py-1">
                {fmtNumber(report.summary.totalOrders)} taxed orders
              </Badge>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href="/admin/management/vatmanagent">
                Back to VAT Management
              </Link>
            </Button>
            <PdfExportButton
              targetId="vat-class-export"
              filename={`vat-class-${report.vatClass.code.toLowerCase()}${dateFrom || dateTo ? `-${dateFrom || "all"}-${dateTo || "all"}` : ""}.pdf`}
            />
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-border/60 bg-card/80 p-4 shadow-sm backdrop-blur">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h3 className="text-lg font-semibold mb-2">
                Filter by date Range
              </h3>
              <p className="text-sm text-muted-foreground">
                The report updates automatically when the date range changes.
              </p>
            </div>
            <form
              method="get"
              className="grid gap-4 md:grid-cols-[1fr_1fr_auto] md:items-end"
            >
              <div className="space-y-2">
                <Label htmlFor="vat-from">Start date</Label>
                <Input
                  id="vat-from"
                  name="dateFrom"
                  type="date"
                  defaultValue={dateFrom || ""}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="vat-to">End date</Label>
                <Input
                  id="vat-to"
                  name="dateTo"
                  type="date"
                  defaultValue={dateTo || ""}
                />
              </div>
              <div className="flex gap-2">
                <Button type="submit">Apply</Button>
                <Button asChild variant="outline">
                  <Link href={`/admin/management/vatmanagent/${id}`}>
                    Clear
                  </Link>
                </Button>
              </div>
            </form>
          </div>
        </div>
      </div>

      <div id="vat-class-export" className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <MetricCard
            title="Collected VAT"
            value={fmtMoney(report.summary.totalVatAmount)}
            hint="From saved order VAT snapshots"
            className="bg-card/90"
          />
          <MetricCard
            title="Taxable Value"
            value={fmtMoney(report.summary.totalTaxableValue)}
            hint="Output tax base for this class"
            className="bg-card/90"
          />
          <MetricCard
            title="Taxed Orders"
            value={fmtNumber(report.summary.totalOrders)}
            hint="Orders where this class contributed VAT"
            className="bg-card/90"
          />
          <MetricCard
            title="Products Assigned"
            value={fmtNumber(report.vatClass.productCount)}
            hint={`${fmtNumber(report.summary.totalQuantitySold)} units sold`}
            className="bg-card/90"
          />
          <MetricCard
            title="Tax Charge"
            value={fmtMoney(report.summary.totalTaxCharge)}
            hint="Added VAT where prices are exclusive"
            className="bg-card/90"
          />
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.2fr_1.8fr]">
          <Card className="border-border/70">
            <CardHeader>
              <CardTitle>Configured Rates</CardTitle>
              <CardDescription>
                Current and historical rates mapped to this VAT class.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Region</TableHead>
                      <TableHead className="text-right">Rate</TableHead>
                      <TableHead className="text-right">Inclusive</TableHead>
                      <TableHead>Effective</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.rates.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={4}
                          className="py-8 text-center text-muted-foreground"
                        >
                          No rates configured for this class.
                        </TableCell>
                      </TableRow>
                    ) : (
                      report.rates.map((rate) => (
                        <TableRow key={rate.id}>
                          <TableCell>
                            {rate.countryCode}
                            {rate.regionCode ? `-${rate.regionCode}` : ""}
                          </TableCell>
                          <TableCell className="text-right">
                            {rate.ratePercent.toFixed(2)}%
                          </TableCell>
                          <TableCell className="text-right">
                            {rate.inclusive ? "Yes" : "No"}
                          </TableCell>
                          <TableCell>
                            {rate.startDate || "Open"} -{" "}
                            {rate.endDate || "Current"}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/70">
            <CardHeader>
              <CardTitle>Product-wise VAT Report</CardTitle>
              <CardDescription>
                Product quantity, taxable value, and VAT realized under this
                class.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead className="text-right">Units</TableHead>
                      <TableHead className="text-right">Orders</TableHead>
                      <TableHead className="text-right">
                        Taxable Value
                      </TableHead>
                      <TableHead className="text-right">VAT Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.products.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={5}
                          className="py-8 text-center text-muted-foreground"
                        >
                          No VAT-bearing product sales found for this class.
                        </TableCell>
                      </TableRow>
                    ) : (
                      report.products.map((product) => (
                        <TableRow key={product.productId}>
                          <TableCell>
                            <div className="font-medium">
                              {product.productName}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {product.slug || `Product #${product.productId}`}
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            {fmtNumber(product.quantitySold)}
                          </TableCell>
                          <TableCell className="text-right">
                            {fmtNumber(product.orderCount)}
                          </TableCell>
                          <TableCell className="text-right">
                            {fmtMoney(product.taxableValue)}
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {fmtMoney(product.totalVatAmount)}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="border-border/70">
          <CardHeader>
            <CardTitle>Order-wise VAT Report</CardTitle>
            <CardDescription>
              Output VAT and taxable value by order for this class.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Country</TableHead>
                    <TableHead className="text-right">Taxable Value</TableHead>
                    <TableHead className="text-right">VAT Amount</TableHead>
                    <TableHead className="text-right">Tax Charge</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.orders.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={7}
                        className="py-8 text-center text-muted-foreground"
                      >
                        No taxed orders found for this class.
                      </TableCell>
                    </TableRow>
                  ) : (
                    report.orders.map((order) => (
                      <TableRow key={order.orderId}>
                        <TableCell className="font-medium">
                          #{order.orderId}
                        </TableCell>
                        <TableCell>{order.orderDate}</TableCell>
                        <TableCell>{order.customerName}</TableCell>
                        <TableCell>{order.country}</TableCell>
                        <TableCell className="text-right">
                          {fmtMoney(order.taxableValue)}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {fmtMoney(order.vatAmount)}
                        </TableCell>
                        <TableCell className="text-right">
                          {fmtMoney(order.taxCharge)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
