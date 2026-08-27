import { PageTitle } from "@/features/shared/dashboard-ui";
import { requireRole } from "@/lib/auth/guards";
import { getPublishedJobs } from "@/features/worker/queries";
import { FindJobsBrowser, type JobRow } from "@/features/worker/FindJobsBrowser";

export default async function FindJobsPage() {
  await requireRole("WORKER");
  const raw = await getPublishedJobs();

  // Serialize to a plain, client-safe shape (Decimal → number, Date → ISO string).
  const jobs: JobRow[] = raw.map((j) => ({
    id: j.id,
    title: j.title,
    urgent: j.urgent,
    categoryName: j.category.name,
    location: j.location ?? "Nearby",
    clientName: j.client.name,
    rate: j.roleLineItems[0]?.perPersonRate != null ? Number(j.roleLineItems[0].perPersonRate) : null,
    startIso: j.startDate ? j.startDate.toISOString() : null,
    openSlots: j.roleLineItems.reduce((s, r) => s + (r.headcount - r.hiredCount), 0),
  }));

  return (
    <div>
      <PageTitle>Find Jobs</PageTitle>
      <FindJobsBrowser jobs={jobs} />
    </div>
  );
}
