"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui";
import { updatePlatformConfigAction } from "./actions";

/*
  ADM-17 PlatformConfig editor. Every change writes to the immutable audit log
  server-side. Read-only unless the admin is Root or Finance (enforced in the action).
*/
type Row = { key: string; value: string; hint: string | null; category: string };

export function ConfigEditor({ rows, canEdit }: { rows: Row[]; canEdit: boolean }) {
  return (
    <div className="flex flex-col gap-2">
      {rows.map((r) => (
        <ConfigRow key={r.key} row={r} canEdit={canEdit} />
      ))}
    </div>
  );
}

function ConfigRow({ row, canEdit }: { row: Row; canEdit: boolean }) {
  const [value, setValue] = useState(row.value);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();
  const dirty = value !== row.value;

  return (
    <div className="flex items-center justify-between gap-4 border-b border-hair py-3 last:border-b-0">
      <div>
        <div className="text-[13.5px] font-medium text-ink">{row.key}</div>
        {row.hint && <div className="text-[11.5px] text-ink3">{row.hint}</div>}
      </div>
      <div className="flex items-center gap-2">
        <input
          value={value}
          disabled={!canEdit}
          onChange={(e) => { setValue(e.target.value); setSaved(false); }}
          className="w-28 rounded-lg border border-line-strong bg-bg px-3 py-1.5 text-right text-[13px] text-ink focus:border-bronze focus:outline-none disabled:opacity-60"
        />
        {canEdit && (
          <Button
            variant="secondary"
            size="sm"
            disabled={!dirty || pending}
            onClick={() => start(async () => { await updatePlatformConfigAction(row.key, value); setSaved(true); })}
          >
            {saved && !dirty ? "Saved" : "Save"}
          </Button>
        )}
      </div>
    </div>
  );
}
