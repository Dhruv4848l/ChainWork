import type { StatusBadgeProps } from "@/components/ui";

type Tone = NonNullable<StatusBadgeProps["tone"]>;
type Display = { tone: Tone; label: string };

/*
  Maps the DB status enums to a StatusBadge tone + human label, so status colours
  stay consistent everywhere (worker, client, admin). Matches the design's legend.
*/

export function phaseStatusDisplay(status: string): Display {
  switch (status) {
    case "PENDING_FUNDING": return { tone: "draft", label: "Pending funding" };
    case "FUNDED": return { tone: "info", label: "Funded" };
    case "IN_PROGRESS": return { tone: "info", label: "In progress" };
    case "DELIVERED": return { tone: "warning", label: "Delivered" };
    case "VERIFICATION_WINDOW_OPEN": return { tone: "warning", label: "Verification window" };
    case "RELEASED": return { tone: "success", label: "Released" };
    case "DISPUTED": return { tone: "danger", label: "Disputed" };
    case "AUTO_CANCELLED": return { tone: "danger", label: "Auto-cancelled" };
    default: return { tone: "draft", label: status };
  }
}

export function applicationStatusDisplay(status: string): Display {
  switch (status) {
    case "APPLIED": return { tone: "info", label: "Applied" };
    case "UNDER_REVIEW": return { tone: "info", label: "Under review" };
    case "ACCEPTED": return { tone: "success", label: "Accepted" };
    case "HIRED": return { tone: "success", label: "Hired" };
    case "REJECTED": return { tone: "danger", label: "Rejected" };
    case "WITHDRAWN": return { tone: "draft", label: "Withdrawn" };
    case "EXPIRED": return { tone: "draft", label: "Expired" };
    default: return { tone: "draft", label: status };
  }
}

export function hireStatusDisplay(status: string): Display {
  switch (status) {
    case "ACTIVE": return { tone: "info", label: "Active" };
    case "NO_SHOW_FLAGGED": return { tone: "danger", label: "No-show flagged" };
    case "COMPLETED": return { tone: "success", label: "Completed" };
    case "CANCELLED": return { tone: "draft", label: "Cancelled" };
    case "ARCHIVED": return { tone: "draft", label: "Archived" };
    default: return { tone: "draft", label: status };
  }
}

export function jobStatusDisplay(status: string): Display {
  switch (status) {
    case "DRAFT": return { tone: "draft", label: "Draft" };
    case "PUBLISHED": return { tone: "success", label: "Published" };
    case "EXPIRED": return { tone: "draft", label: "Expired" };
    case "CANCELLED": return { tone: "danger", label: "Cancelled" };
    case "ARCHIVED": return { tone: "draft", label: "Archived" };
    default: return { tone: "draft", label: status };
  }
}
