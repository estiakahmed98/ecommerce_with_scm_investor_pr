import { redirect } from "next/navigation";

export default function SupplierHomeRedirectPage() {
  redirect("/supplier/dashboard");
}
