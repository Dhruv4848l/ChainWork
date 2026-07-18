import { redirect } from "next/navigation";
import { AuthShell } from "@/features/auth/AuthShell";
import { AuthForm } from "@/features/auth/AuthForm";
import { DevLoginPanel } from "@/features/auth/DevLoginPanel";
import { getCurrentUser } from "@/lib/auth/currentUser";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string; returnTo?: string }>;
}) {
  const { mode, returnTo } = await searchParams;
  const user = await getCurrentUser();
  if (user)
    redirect(user.role === "WORKER" ? "/dashboard/worker" : "/dashboard/client");

  return (
    <AuthShell>
      <AuthForm
        initialMode={mode === "signup" ? "signup" : "login"}
        returnTo={returnTo ?? ""}
      />
      {process.env.NODE_ENV !== "production" && <DevLoginPanel />}
    </AuthShell>
  );
}
