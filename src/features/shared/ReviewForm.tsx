"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Card } from "@/components/ui";
import { useToast } from "./Toast";

/*
  Post-completion review form (WK-14 / CL-10). Overall rating is required; the three
  sub-dimensions (punctuality, quality, communication) are optional. The concrete
  server action is passed in by the page, so this one component serves both directions.
*/

type ReviewResult = { ok?: boolean; error?: string; message?: string };
type SubmitAction = (input: {
  hireId: string;
  overall: number;
  punctuality?: number;
  quality?: number;
  communication?: number;
  text?: string;
}) => Promise<ReviewResult>;

function Stars({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          aria-label={`${n} star${n > 1 ? "s" : ""}`}
          className={`text-lg leading-none transition-colors ${n <= value ? "text-bronze" : "text-line-strong hover:text-bronze/50"}`}
        >
          ★
        </button>
      ))}
    </div>
  );
}

function Dimension({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[12.5px] text-ink2">{label}</span>
      <Stars value={value} onChange={onChange} />
    </div>
  );
}

export function ReviewForm({
  hireId,
  who,
  job,
  submitAction,
}: {
  hireId: string;
  who: string;
  job: string;
  submitAction: SubmitAction;
}) {
  const [open, setOpen] = useState(false);
  const [overall, setOverall] = useState(0);
  const [punctuality, setPunctuality] = useState(0);
  const [quality, setQuality] = useState(0);
  const [communication, setCommunication] = useState(0);
  const [text, setText] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  const toast = useToast();

  function submit() {
    if (overall < 1) return toast("Give an overall rating.", "error");
    start(async () => {
      const r = await submitAction({
        hireId,
        overall,
        punctuality: punctuality || undefined,
        quality: quality || undefined,
        communication: communication || undefined,
        text: text.trim() || undefined,
      });
      if (r.error) return toast(r.error, "error");
      toast(r.message ?? "Review submitted.", "success");
      router.refresh();
    });
  }

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <div>
          <span className="text-[14px] font-semibold text-ink">{who}</span>
          <span className="ml-2 text-[12px] text-ink3">{job}</span>
        </div>
        {!open && (
          <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
            Leave a review
          </Button>
        )}
      </div>

      {open && (
        <div className="mt-4 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-medium text-ink">Overall</span>
            <Stars value={overall} onChange={setOverall} />
          </div>
          <div className="flex flex-col gap-2 rounded-lg border border-hair bg-bg px-3.5 py-3">
            <Dimension label="Punctuality" value={punctuality} onChange={setPunctuality} />
            <Dimension label="Quality" value={quality} onChange={setQuality} />
            <Dimension label="Communication" value={communication} onChange={setCommunication} />
          </div>
          <textarea
            rows={3}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Share a few words about working together (optional)."
            className="rounded-[10px] border border-line-strong bg-bg px-4 py-3 text-[13.5px] text-ink placeholder:text-ink3 focus:border-bronze focus:outline-none"
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" disabled={pending} onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" disabled={pending || overall < 1} onClick={submit}>
              Submit review
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
