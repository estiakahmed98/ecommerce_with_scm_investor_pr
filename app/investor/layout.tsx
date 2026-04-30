import { getServerSession } from "next-auth/next";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { getDashboardRoute } from "@/lib/dashboard-route";
import { resolveInvestorPortalContext } from "@/lib/investor-portal";
import InvestorNav from "@/components/investor/InvestorNav";

export default async function InvestorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/signin?returnUrl=/investor");
  }

  const resolved = await resolveInvestorPortalContext(
    session.user as { id?: string; role?: string } | undefined,
  );

  if (!resolved.ok) {
    if (resolved.status === 401) {
      redirect("/signin?returnUrl=/investor");
    }

    const fallbackRoute = getDashboardRoute(
      session.user as {
        role?: string | null;
        permissions?: string[] | null;
        defaultAdminRoute?: "/admin" | "/admin/warehouse" | null;
      },
    );

    redirect(fallbackRoute.startsWith("/investor") ? "/ecommerce/user/" : fallbackRoute);
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto flex min-h-screen w-full">
        <InvestorNav
          investorName={resolved.context.investorName}
          investorCode={resolved.context.investorCode}
        />
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
