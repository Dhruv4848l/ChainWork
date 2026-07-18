import { redirect } from "next/navigation";

export default function AdminIndexPage() {
  // The proxy bounces unauthenticated visitors to /admin/login.
  redirect("/admin/dashboard");
}
