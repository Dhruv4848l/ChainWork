import type { AdminRole } from "@/generated/admin";

/*
  Role-scoped console access (spec 11.1, ADM-18). Each internal role sees only its
  sections; ANALYST is read-only (no action buttons render); JURY sees only its
  assigned cases. ROOT_SUPER_ADMIN sees everything.
*/

export type NavKey =
  | "dashboard" | "users" | "jobs" | "blogMod" | "complaints" | "ongoing"
  | "settlements" | "confirmations" | "payments" | "disputes" | "jury"
  | "reports" | "settings" | "roles" | "audit";

export interface NavItem {
  key: NavKey;
  label: string;
  href: string;
  section: string;
}

export const ADMIN_NAV: NavItem[] = [
  { key: "dashboard", label: "Dashboard", href: "/admin/dashboard", section: "Overview" },
  { key: "users", label: "Users / KYC Queue", href: "/admin/users", section: "People & Content" },
  { key: "jobs", label: "Job Moderation", href: "/admin/jobs", section: "People & Content" },
  { key: "blogMod", label: "Blog Moderation", href: "/admin/blog-moderation", section: "People & Content" },
  { key: "complaints", label: "Complaint Triage", href: "/admin/complaints", section: "Operations" },
  { key: "ongoing", label: "Ongoing Work", href: "/admin/ongoing", section: "Operations" },
  { key: "settlements", label: "Pending Settlements", href: "/admin/settlements", section: "Operations" },
  { key: "confirmations", label: "Pending Confirmations", href: "/admin/confirmations", section: "Operations" },
  { key: "payments", label: "Pending Payments", href: "/admin/payments", section: "Operations" },
  { key: "disputes", label: "Dispute Queue", href: "/admin/disputes", section: "Disputes & Jury" },
  { key: "jury", label: "Jury Roster", href: "/admin/jury", section: "Disputes & Jury" },
  { key: "reports", label: "Reports & Analytics", href: "/admin/reports", section: "Platform" },
  { key: "settings", label: "Platform Settings", href: "/admin/settings", section: "Platform" },
  { key: "roles", label: "Roles & Permissions", href: "/admin/roles", section: "Platform" },
  { key: "audit", label: "Audit Log", href: "/admin/audit", section: "Platform" },
];

// null = everything
const ACCESS: Record<AdminRole, NavKey[] | null> = {
  ROOT_SUPER_ADMIN: null,
  VERIFICATION_OFFICER: ["dashboard", "users"],
  MODERATION_OFFICER: ["dashboard", "jobs", "blogMod"],
  SUPPORT_AGENT: ["dashboard", "complaints"],
  FINANCE_COMPLIANCE_OFFICER: ["dashboard", "settlements", "confirmations", "payments", "complaints", "settings"],
  ANALYST: ["dashboard", "ongoing", "reports"],
  JURY: ["dashboard", "disputes"],
};

export function canAccess(role: AdminRole, key: NavKey): boolean {
  const allowed = ACCESS[role];
  return allowed === null || allowed.includes(key);
}

export function visibleNav(role: AdminRole): NavItem[] {
  return ADMIN_NAV.filter((n) => canAccess(role, n.key));
}

/** ANALYST is strictly read-only — no action buttons render for them. */
export function isReadOnly(role: AdminRole): boolean {
  return role === "ANALYST";
}

export const ADMIN_ROLE_LABEL: Record<AdminRole, string> = {
  ROOT_SUPER_ADMIN: "Root Super Admin",
  VERIFICATION_OFFICER: "Verification Officer",
  MODERATION_OFFICER: "Moderation Officer",
  SUPPORT_AGENT: "Support Agent",
  FINANCE_COMPLIANCE_OFFICER: "Finance / Compliance",
  ANALYST: "Analyst",
  JURY: "Jury",
};
