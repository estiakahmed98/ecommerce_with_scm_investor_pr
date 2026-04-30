import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function parseDate(v: string | null, fallback: Date) {
  if (!v) return fallback;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return fallback;
  return d;
}

function toBucketKey(date: Date, bucket: "hour" | "day") {
  const iso = date.toISOString();
  if (bucket === "hour") return `${iso.slice(0, 13)}:00:00.000Z`;
  return `${iso.slice(0, 10)}T00:00:00.000Z`;
}

function bump(map: Map<string, number>, key: string) {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function toSortedRows(map: Map<string, number>, limit: number) {
  return Array.from(map.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);

    const now = new Date();
    const to = parseDate(searchParams.get("to"), now);
    const from = parseDate(
      searchParams.get("from"),
      new Date(now.getTime() - 7 * 24 * 3600 * 1000)
    );
    const bucket = (searchParams.get("bucket") === "hour" ? "hour" : "day") as
      | "hour"
      | "day";

    if (to <= from) {
      return NextResponse.json(
        { ok: false, error: "Invalid range" },
        { status: 400 }
      );
    }

    const [events, liveUsersRows] = await Promise.all([
      prisma.analyticsEvent.findMany({
        where: { ts: { gte: from, lt: to } },
        select: {
          ts: true,
          event: true,
          visitorId: true,
          path: true,
          activeSeconds: true,
          utmSource: true,
          referrer: true,
          deviceType: true,
          browser: true,
          os: true,
          country: true,
          city: true,
        },
      }),
      prisma.analyticsEvent.findMany({
        where: {
          ts: { gte: new Date(now.getTime() - 1 * 60 * 1000) },
          event: "heartbeat",
        },
        select: { visitorId: true },
        distinct: ["visitorId"],
      }),
    ]);

    const uniqueVisitors = new Set<string>();
    const bucketStats = new Map<string, { visitors: Set<string>; pageViews: number }>();
    const topPagesMap = new Map<string, { views: number; active: number }>();
    const sourceMap = new Map<string, number>();
    const deviceTypeMap = new Map<string, number>();
    const browserMap = new Map<string, number>();
    const osMap = new Map<string, number>();
    const countryMap = new Map<string, number>();
    const cityMap = new Map<string, number>();

    let pageViews = 0;
    let activeTimeSec = 0;

    for (const ev of events) {
      uniqueVisitors.add(ev.visitorId);

      const bucketKey = toBucketKey(ev.ts, bucket);
      const currentBucket = bucketStats.get(bucketKey) ?? {
        visitors: new Set<string>(),
        pageViews: 0,
      };
      currentBucket.visitors.add(ev.visitorId);
      if (ev.event === "page_view") currentBucket.pageViews += 1;
      bucketStats.set(bucketKey, currentBucket);

      const pageKey = ev.path || "/";
      const pageStats = topPagesMap.get(pageKey) ?? { views: 0, active: 0 };
      if (ev.event === "page_view") {
        pageStats.views += 1;
        pageViews += 1;
      }
      if (ev.event === "heartbeat") {
        const active = ev.activeSeconds ?? 0;
        pageStats.active += active;
        activeTimeSec += active;
      }
      topPagesMap.set(pageKey, pageStats);

      bump(deviceTypeMap, ev.deviceType?.trim() || "unknown");
      bump(browserMap, ev.browser?.trim() || "unknown");
      bump(osMap, ev.os?.trim() || "unknown");

      if (ev.event === "page_view") {
        const source = ev.utmSource?.trim() || ev.referrer?.trim() || "direct";
        bump(sourceMap, source);
        bump(countryMap, ev.country?.trim() || "unknown");
        bump(cityMap, ev.city?.trim() || "unknown");
      }
    }

    const visitors = uniqueVisitors.size;
    const avgActiveTimeSec = visitors > 0 ? Math.floor(activeTimeSec / visitors) : 0;
    const liveUsers = liveUsersRows.length;

    const series = Array.from(bucketStats.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([t, stats]) => ({
        t,
        visitors: stats.visitors.size,
        pageViews: stats.pageViews,
      }));

    const topPages = Array.from(topPagesMap.entries())
      .map(([path, stats]) => ({
        path,
        views: stats.views,
        avgActiveTimeSec: stats.views > 0 ? Math.floor(stats.active / stats.views) : 0,
      }))
      .sort((a, b) => b.views - a.views)
      .slice(0, 20);

    const sources = toSortedRows(sourceMap, 15);
    const deviceType = toSortedRows(deviceTypeMap, 15);
    const browser = toSortedRows(browserMap, 15);
    const os = toSortedRows(osMap, 15);
    const countries = toSortedRows(countryMap, 15);
    const cities = toSortedRows(cityMap, 15);

    return NextResponse.json({
      kpis: { visitors, pageViews, activeTimeSec, avgActiveTimeSec, liveUsers },
      series,
      topPages,
      sources,
      devices: {
        deviceType,
        browser,
        os,
      },
      geo: {
        enabled: true,
        countries,
        cities,
      },
    });
  } catch (err) {
    console.error("Failed to load analytics summary", err);
    return NextResponse.json(
      { ok: false, error: "Failed to load analytics summary" },
      { status: 500 }
    );
  }
}
