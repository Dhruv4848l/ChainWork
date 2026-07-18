import { redirect } from "next/navigation";
import { AuthShell } from "@/features/auth/AuthShell";
import { AuthForm } from "@/features/auth/AuthForm";
import { DevLoginPanel } from "@/features/auth/DevLoginPanel";
import { getCurrentUser } from "@/lib/auth/currentUser";

export default async function SignupPage() {
  const user = await getCurrentUser();
  if (user)
    redirect(user.role === "WORKER" ? "/dashboard/worker" : "/dashboard/client");

  return (
    <AuthShell>
      <AuthForm initialMode="signup" />
      {process.env.NODE_ENV !== "production" && <DevLoginPanel />}
    </AuthShell>
  );
}
