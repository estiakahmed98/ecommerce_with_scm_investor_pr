type StatementSummary = {
  credit: string;
  debit: string;
  net: string;
};

type StatementTransaction = {
  transactionNumber: string;
  transactionDate: string;
  type: string;
  direction: string;
  amount: string;
  currency: string;
};

type StatementPayout = {
  payoutNumber: string;
  status: string;
  payoutAmount: string;
  currency: string;
  createdAt: string;
  paidAt: string | null;
};

type StatementBlock = {
  investorCode: string;
  investorName: string;
  status?: string;
  summary: StatementSummary;
  transactions: StatementTransaction[];
  payouts: StatementPayout[];
};

function fmtDate(value?: string | null) {
  if (!value) return "N/A";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "N/A";
  return parsed.toLocaleString();
}

export async function exportInvestorStatementPdf(params: {
  fileName: string;
  title: string;
  from: string;
  to: string;
  statements: StatementBlock[];
}) {
  const jsPdfModule = await import("jspdf");
  const autoTableModule = await import("jspdf-autotable");

  const JsPdf = (jsPdfModule as any).jsPDF ?? (jsPdfModule as any).default;
  const autoTable =
    (autoTableModule as any).default ??
    (autoTableModule as any).autoTable ??
    autoTableModule;
  const doc = new JsPdf("p", "pt", "a4");

  let y = 40;
  doc.setFontSize(16);
  doc.text(params.title, 40, y);
  y += 18;
  doc.setFontSize(10);
  doc.text(`From: ${fmtDate(params.from)}    To: ${fmtDate(params.to)}`, 40, y);
  y += 18;

  for (const statement of params.statements) {
    doc.setFontSize(12);
    doc.text(
      `${statement.investorName} (${statement.investorCode})${statement.status ? ` • ${statement.status}` : ""}`,
      40,
      y,
    );
    y += 16;
    doc.setFontSize(10);
    doc.text(
      `Credit: ${statement.summary.credit}    Debit: ${statement.summary.debit}    Net: ${statement.summary.net}`,
      40,
      y,
    );
    y += 14;

    autoTable(doc, {
      startY: y,
      head: [["Transaction", "Date", "Type", "Direction", "Amount"]],
      body:
        statement.transactions.length > 0
          ? statement.transactions.map((row) => [
              row.transactionNumber,
              fmtDate(row.transactionDate),
              row.type,
              row.direction,
              `${row.amount} ${row.currency}`,
            ])
          : [["No transactions in selected range.", "", "", "", ""]],
      theme: "grid",
      styles: { fontSize: 8 },
      margin: { left: 40, right: 40 },
    });

    y = (doc as any).lastAutoTable.finalY + 12;

    autoTable(doc, {
      startY: y,
      head: [["Payout", "Status", "Amount", "Created", "Paid"]],
      body:
        statement.payouts.length > 0
          ? statement.payouts.map((row) => [
              row.payoutNumber,
              row.status,
              `${row.payoutAmount} ${row.currency}`,
              fmtDate(row.createdAt),
              fmtDate(row.paidAt),
            ])
          : [["No payouts in selected range.", "", "", "", ""]],
      theme: "grid",
      styles: { fontSize: 8 },
      margin: { left: 40, right: 40 },
    });

    y = (doc as any).lastAutoTable.finalY + 22;

    if (y > 700) {
      doc.addPage();
      y = 40;
    }
  }

  doc.save(params.fileName);
}
