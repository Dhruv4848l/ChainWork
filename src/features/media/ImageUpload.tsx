"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  uploadAvatarAction,
  uploadPortfolioImageAction,
  removePortfolioImageAction,
  type MediaState,
} from "./actions";

/*
  Client upload controls. A hidden <input type="file"> auto-submits its form to a
  server action on change; the action uploads to Cloudinary and returns the URL.
  Images are shown from their https URL (allowed by the CSP img-src in next.config).
*/

export function AvatarUpload({
  name,
  initialUrl,
}: {
  name: string;
  initialUrl: string | null;
}) {
  const [state, action, pending] = useActionState(uploadAvatarAction, {} as MediaState);
  const formRef = useRef<HTMLFormElement>(null);
  const url = state.url ?? initialUrl;

  return (
    <form ref={formRef} action={action} className="flex items-center gap-4">
      <div className="flex h-20 w-20 flex-shrink-0 items-center justify-center overflow-hidden rounded-full border border-bronze/40 bg-card2 font-display text-3xl text-bronze">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={name} className="h-full w-full object-cover" />
        ) : (
          name.charAt(0)
        )}
      </div>
      <div>
        <label
          className={`inline-block cursor-pointer rounded-full border px-4 py-2 text-[12.5px] font-semibold ${
            pending ? "border-line-strong text-ink3" : "border-line-strong text-ink2 hover:border-bronze"
          }`}
        >
          {pending ? "Uploading…" : url ? "Change photo" : "Upload photo"}
          <input
            type="file"
            name="file"
            accept="image/*"
            className="hidden"
            disabled={pending}
            onChange={(e) => {
              if (e.target.files?.length) formRef.current?.requestSubmit();
            }}
          />
        </label>
        {state.error && <p className="mt-1.5 text-xs text-ember">{state.error}</p>}
        <p className="mt-1.5 text-[11px] text-ink3">JPG, PNG, WebP or GIF · up to 5 MB.</p>
      </div>
    </form>
  );
}

export function PortfolioUpload({ initialImages }: { initialImages: string[] }) {
  const [addState, addAction, adding] = useActionState(uploadPortfolioImageAction, {} as MediaState);
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();
  const [pendingRemove, startRemove] = useTransition();
  const [removingUrl, setRemovingUrl] = useState<string | null>(null);

  // Show stored images plus the just-uploaded one (until the route refreshes).
  const images = [...initialImages];
  if (addState.url && !images.includes(addState.url)) images.push(addState.url);

  function remove(u: string) {
    setRemovingUrl(u);
    startRemove(async () => {
      await removePortfolioImageAction(u);
      router.refresh();
      setRemovingUrl(null);
    });
  }

  return (
    <div>
      <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4">
        {images.map((u) => (
          <div
            key={u}
            className="group relative aspect-square overflow-hidden rounded-[10px] border border-hair bg-card2"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={u} alt="Work photo" className="h-full w-full object-cover" />
            <button
              type="button"
              onClick={() => remove(u)}
              disabled={pendingRemove}
              className="absolute right-1 top-1 rounded-full bg-bg/85 px-2 py-0.5 text-[11px] font-semibold text-ember opacity-0 transition-opacity group-hover:opacity-100"
              aria-label="Remove photo"
            >
              {removingUrl === u ? "…" : "✕"}
            </button>
          </div>
        ))}

        <form ref={formRef} action={addAction} className="contents">
          <label className="flex aspect-square cursor-pointer flex-col items-center justify-center gap-1 rounded-[10px] border border-dashed border-line-strong text-center text-[11px] text-ink3 hover:border-bronze hover:text-bronze">
            <span className="text-lg leading-none">{adding ? "…" : "+"}</span>
            <span>{adding ? "Uploading" : "Add photo"}</span>
            <input
              type="file"
              name="file"
              accept="image/*"
              className="hidden"
              disabled={adding}
              onChange={(e) => {
                if (e.target.files?.length) formRef.current?.requestSubmit();
              }}
            />
          </label>
        </form>
      </div>
      {addState.error && <p className="mt-2 text-xs text-ember">{addState.error}</p>}
    </div>
  );
}
