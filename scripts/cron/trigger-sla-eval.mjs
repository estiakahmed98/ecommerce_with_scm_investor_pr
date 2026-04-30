const DEFAULT_URL = "http://localhost:3000/api/cron/scm/sla-evaluate";
const DEFAULT_TIMEOUT_MS = 30000;

function requireEnv(name) {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value.trim();
}

function parseTimeout(value) {
  const numeric = Number(value ?? DEFAULT_TIMEOUT_MS);
  if (!Number.isFinite(numeric) || numeric <= 0) return DEFAULT_TIMEOUT_MS;
  return Math.min(300000, Math.max(5000, Math.round(numeric)));
}

async function main() {
  const cronSecret = requireEnv("CRON_SECRET");
  const baseUrl = (process.env.SLA_CRON_URL || DEFAULT_URL).trim();
  const timeoutMs = parseTimeout(process.env.SLA_CRON_TIMEOUT_MS);
  const supplierIdRaw = (process.env.SLA_CRON_SUPPLIER_ID || "").trim();

  const url = new URL(baseUrl);
  if (supplierIdRaw) {
    const supplierId = Number(supplierIdRaw);
    if (!Number.isInteger(supplierId) || supplierId <= 0) {
      throw new Error("SLA_CRON_SUPPLIER_ID must be a positive integer.");
    }
    url.searchParams.set("supplierId", String(supplierId));
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const startedAt = new Date().toISOString();
    console.log(`[sla-cron] Triggering SLA evaluation at ${startedAt}`);
    console.log(`[sla-cron] Target: ${url.toString()}`);

    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${cronSecret}`,
      },
      signal: controller.signal,
    });

    const text = await response.text();
    if (!response.ok) {
      throw new Error(
        `SLA cron request failed (${response.status} ${response.statusText}): ${text}`,
      );
    }

    console.log(`[sla-cron] Success (${response.status})`);
    console.log(text);
  } finally {
    clearTimeout(timer);
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[sla-cron] ${message}`);
  process.exitCode = 1;
});
