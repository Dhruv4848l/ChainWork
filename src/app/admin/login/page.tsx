import Link from "next/link";
import { redirect } from "next/navigation";
import { ThemeToggle } from "@/components/ui";
import { AdminLoginForm } from "@/features/admin/AdminLoginForm";
import { getAdminSession } from "@/lib/admin/session";

export const metadata = { title: "ChainWork Operations — Sign in" };

export default async function AdminLoginPage() {
  if (await getAdminSession()) redirect("/admin/dashboard");
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4">
      <div className="absolute right-6 top-6">
        <ThemeToggle />
      </div>
      <Link href="/" className="mb-8 font-display text-lg tracking-[0.3em] text-bronze">
        CHAINWORK
      </Link>
      <AdminLoginForm />
    </main>
  );
}
