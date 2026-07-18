import Link from "next/link";
import { Card, StatusBadge } from "@/components/ui";
import { PageTitle, EmptyState } from "@/features/shared/dashboard-ui";
import { requireRole } from "@/lib/auth/guards";
import { getClientMessageThreads, getClientThread } from "@/features/client/queries";
import { ClientMessageComposer } from "@/features/client/ClientMessageComposer";

export default async function ClientMessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ thread?: string }>;
}) {
  const user = await requireRole("CLIENT");
  const { thread } = await searchParams;
  const threads = await getClientMessageThreads(user.id);

  if (threads.length === 0) {
    return (
      <div>
        <PageTitle>Messages</PageTitle>
        <EmptyState title="No conversations yet" hint="Chats open once you hire — they're scoped to each hire." />
      </div>
    );
  }

  const activeId = thread ?? threads[0].hireId;
  const active = await getClientThread(activeId, user.id);

  return (
    <div>
      <PageTitle>Messages</PageTitle>
      <Card className="grid min-h-[440px] grid-cols-1 overflow-hidden p-0 md:grid-cols-[300px_1fr]">
        <div className="border-b border-line md:border-b-0 md:border-r">
          {threads.map((t) => (
            <Link
              key={t.hireId}
              href={`/dashboard/client/messages?thread=${t.hireId}`}
              className={`block border-b border-hair px-5 py-4 ${t.hireId === activeId ? "bg-bronze/[0.06]" : ""}`}
            >
              <span className="text-[13.5px] font-semibold text-ink">{t.who}</span>
              <div className="mt-0.5 text-[11.5px] text-ink3">{t.hire}</div>
              <div className="mt-1 truncate text-xs text-ink2">{t.last}</div>
            </Link>
          ))}
        </div>
        <div className="flex flex-col">
          {active && (
            <>
              <div className="flex items-center justify-between border-b border-line px-6 py-3.5">
                <div>
                  <span className="text-sm font-semibold text-ink">{active.worker.name}</span>
                  <span className="text-[11.5px] text-ink3"> · {active.job.title}</span>
                </div>
                <StatusBadge tone="warning">Verification window</StatusBadge>
              </div>
              <div className="flex flex-1 flex-col gap-3 p-6">
                {active.messages.map((m) => {
                  const mine = m.senderId === user.id;
                  return (
                    <div key={m.id} className={`max-w-[70%] rounded-2xl border px-4 py-2.5 ${mine ? "self-end border-bronze/30 bg-bronze/[0.08]" : "self-start border-line bg-bg"}`}>
                      <div className="text-[13.5px] leading-relaxed text-ink">{m.body}</div>
                    </div>
                  );
                })}
              </div>
              <ClientMessageComposer />
            </>
          )}
        </div>
      </Card>
    </div>
  );
}
