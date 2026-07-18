"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Card } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { markNotificationReadAction, markAllNotificationsReadAction } from "./notificationActions";

/*
  The notification center (WK-15 / CL-11). Renders the user's notifications; clicking
  one marks it read and follows its linkUrl (if any). "Mark all read" clears the badge.
*/

type Notif = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  linkUrl: string | null;
  read: boolean;
  createdAt: Date;
};

const TYPE_COLOR: Record<string, string> = {
  PAYMENT: "bg-emerald",
  ESCROW: "bg-[#8FC7E8]",
  DISPUTE: "bg-ember",
  REMINDER: "bg-amber",
  APPLICATION: "bg-bronze",
  JURY: "bg-ember",
  MESSAGE: "bg-[#8FC7E8]",
  REVIEW: "bg-emerald",
};

export function NotificationCenter({ notifs }: { notifs: Notif[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const anyUnread = notifs.some((n) => !n.read);

  function open(n: Notif) {
    start(async () => {
      if (!n.read) await markNotificationReadAction(n.id);
      if (n.linkUrl) router.push(n.linkUrl);
      else router.refresh();
    });
  }

  function markAll() {
    start(async () => {
      await markAllNotificationsReadAction();
      router.refresh();
    });
  }

  return (
    <>
      <div className="mb-3 flex justify-end">
        <button
          onClick={markAll}
          disabled={pending || !anyUnread}
          className="text-[12px] font-semibold text-bronze hover:underline disabled:text-ink3 disabled:no-underline"
        >
          Mark all read
        </button>
      </div>
      <Card className="overflow-hidden p-0">
        {notifs.map((n) => (
          <button
            key={n.id}
            onClick={() => open(n)}
            className={`flex w-full items-start gap-3.5 border-b border-hair px-6 py-4 text-left transition-colors last:border-b-0 hover:bg-bronze/[0.05] ${
              n.read ? "" : "bg-bronze/[0.04]"
            }`}
          >
            <span className={`mt-1.5 h-2 w-2 flex-shrink-0 rounded-full ${n.read ? "bg-transparent" : TYPE_COLOR[n.type] ?? "bg-ink3"}`} />
            <span className="flex-1">
              <span className={`block text-[13.5px] ${n.read ? "text-ink2" : "font-medium text-ink"}`}>{n.title}</span>
              {n.body && <span className="mt-0.5 block text-[12.5px] text-ink2">{n.body}</span>}
              <span className="mt-1 block text-[11px] text-ink3">
                {formatDate(n.createdAt)}
                {n.linkUrl && <span className="ml-2 text-bronze">View →</span>}
              </span>
            </span>
          </button>
        ))}
      </Card>
    </>
  );
}
