import { getServerSession } from "next-auth/next";
import { redirect } from "next/navigation";
import { DeliveryDashboardClient } from "@/components/delivery/DeliveryDashboardClient";
import { authOptions } from "@/lib/auth";
import { DELIVERY_DASHBOARD_ROUTE } from "@/lib/dashboard-route";
import { getAccessContext } from "@/lib/rbac";

export default async function AdminDeliveryDashboardPage() {
  const session = await getServerSession(authOptions);
  const access = await getAccessContext(
    session?.user as { id?: string; role?: string } | undefined,
  );

  if (!access.userId) {
    redirect(
      `/signin?returnUrl=${encodeURIComponent(DELIVERY_DASHBOARD_ROUTE)}`,
    );
  }

  if (!access.has("delivery.dashboard.access")) {
    redirect(access.has("admin.panel.access") ? access.defaultAdminRoute : "/");
  }

  return <DeliveryDashboardClient />;
}
