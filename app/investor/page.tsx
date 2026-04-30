import { redirect } from "next/navigation";

export default function InvestorHomeRedirectPage() {
  redirect("/investor/dashboard");
}
