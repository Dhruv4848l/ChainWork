import Link from "next/link";
import { notFound } from "next/navigation";
import { getHireForContract, contractDocument } from "./queries";
import { ContractSigning, type SignatureRecord } from "./ContractSigning";
import { formatInr } from "@/lib/format";

/*
  Server half of the signing screen. Both the client route and the worker route
  render this with the same hire — identical document, identical hash, different
  "you". Keeping it in one component is what guarantees the two sides can't drift.
*/

function stamp(d: Date | null): string | null {
  if (!d) return null;
  return d.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

export async function ContractSigningScreen({
  hireId,
  userId,
  viewer,
}: {
  hireId: string;
  userId: string;
  viewer: "client" | "worker";
}) {
  const hire = await getHireForContract(hireId, userId);
  if (!hire || !hire.contract) notFound();

  const doc = contractDocument(hire);
  const c = hire.contract;

  const signatures: SignatureRecord[] = [
    {
      roleLabel: "Client",
      name: hire.client.name,
      signature: c.clientSignature,
      signedAt: stamp(c.clientSignedAt),
      ip: c.clientSignedIp,
      isYou: viewer === "client",
    },
    {
      roleLabel: "Worker",
      name: hire.worker.name,
      signature: c.workerSignature,
      signedAt: stamp(c.workerSignedAt),
      ip: c.workerSignedIp,
      isYou: viewer === "worker",
    },
  ];

  const youSigned = viewer === "client" ? Boolean(c.clientSignature) : Boolean(c.workerSignature);
  const bothSigned = Boolean(c.clientSignature && c.workerSignature);
  const hireHref = `/dashboard/${viewer}/hires/${hire.id}`;

  return (
    <div>
      <Link
        href={hireHref}
        className="mb-3.5 inline-block text-[12.5px] font-semibold uppercase tracking-wider text-bronze hover:underline"
      >
        ← Back to the hire
      </Link>
      <h1 className="mb-1 text-[26px] font-semibold text-ink">
        Contract — {hire.job.title}
      </h1>
      <p className="mb-5 text-[13px] text-ink3">
        {hire.client.name} ↔ {hire.worker.name} · {formatInr(Number(c.totalValue))} across{" "}
        {hire.phases.length} phases ·{" "}
        {bothSigned
          ? "signed by both parties — escrow unlocked"
          : "escrow stays locked until both signatures are recorded"}
      </p>

      <ContractSigning
        hireId={hire.id}
        documentText={doc.text}
        documentHash={doc.hash}
        intact={doc.intact}
        signatures={signatures}
        youSigned={youSigned}
        bothSigned={bothSigned}
        yourName={viewer === "client" ? hire.client.name : hire.worker.name}
        nextHref={hireHref}
      />
    </div>
  );
}
