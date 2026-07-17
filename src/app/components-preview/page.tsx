"use client";

import { useState } from "react";
import {
  Button,
  Card,
  Input,
  Modal,
  StatusBadge,
  ThemeToggle,
} from "@/components/ui";

/*
  /components-preview — a living catalogue of the design-system primitives.
  Use it to eyeball every component in BOTH themes (toggle top-right). This page is
  a developer tool, not a product screen; it does not appear in app navigation.
*/
export default function ComponentsPreviewPage() {
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <header className="mb-10 flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl text-ink">Component Preview</h1>
          <p className="mt-2 text-sm text-ink2">
            ChainWork design system — Phase 0. Toggle the theme to check both
            palettes.
          </p>
        </div>
        <ThemeToggle />
      </header>

      <div className="flex flex-col gap-8">
        {/* Buttons */}
        <Section title="Buttons">
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="primary">Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="success">Success</Button>
            <Button variant="danger">Danger</Button>
            <Button variant="primary" disabled>
              Disabled
            </Button>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Button variant="primary" size="sm">
              Small
            </Button>
            <Button variant="secondary" size="sm">
              Small
            </Button>
          </div>
        </Section>

        {/* Status badges */}
        <Section title="Status Badges">
          <div className="flex flex-wrap items-center gap-3">
            <StatusBadge tone="draft">Draft</StatusBadge>
            <StatusBadge tone="info">In Progress</StatusBadge>
            <StatusBadge tone="warning">Verification Window</StatusBadge>
            <StatusBadge tone="success">Released</StatusBadge>
            <StatusBadge tone="danger">Disputed</StatusBadge>
          </div>
        </Section>

        {/* Inputs */}
        <Section title="Inputs">
          <div className="grid max-w-md gap-4">
            <Input
              label="Email"
              type="email"
              placeholder="you@example.com"
              hint="We'll send a verification link."
            />
            <Input
              label="Phone"
              placeholder="+91 98765 43210"
              error="Enter a valid phone number."
            />
          </div>
        </Section>

        {/* Cards */}
        <Section title="Cards">
          <div className="grid gap-4 sm:grid-cols-2">
            <Card className="p-6">
              <h3 className="font-display text-xl text-ink">Standard card</h3>
              <p className="mt-2 text-sm text-ink2">
                A surface one step above the page background, with a hairline
                border.
              </p>
            </Card>
            <Card hover className="p-6">
              <h3 className="font-display text-xl text-ink">Hover card</h3>
              <p className="mt-2 text-sm text-ink2">
                Bronze border on hover — used for clickable cards.
              </p>
            </Card>
          </div>
        </Section>

        {/* Modal */}
        <Section title="Modal">
          <Button variant="primary" onClick={() => setModalOpen(true)}>
            Open modal
          </Button>
          <Modal
            open={modalOpen}
            onClose={() => setModalOpen(false)}
            title="Release payment?"
          >
            <p className="text-sm text-ink2">
              This releases the escrowed funds for this phase to the worker. This
              action cannot be undone.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <Button variant="ghost" onClick={() => setModalOpen(false)}>
                Cancel
              </Button>
              <Button variant="success" onClick={() => setModalOpen(false)}>
                Release
              </Button>
            </div>
          </Modal>
        </Section>

        {/* Type + colour reference */}
        <Section title="Typography & Colour">
          <p className="font-display text-3xl text-ink">
            Italiana — display headings
          </p>
          <p className="mt-1 text-base text-ink2">
            Outfit — body text, the workhorse UI font.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Swatch className="bg-bronze" label="bronze" />
            <Swatch className="bg-emerald" label="emerald" />
            <Swatch className="bg-amber" label="amber" />
            <Swatch className="bg-ember" label="ember" />
            <Swatch className="bg-card border border-line" label="card" />
          </div>
        </Section>
      </div>
    </main>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="mb-4 text-xs font-semibold uppercase tracking-widest text-ink3">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Swatch({ className, label }: { className: string; label: string }) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className={`h-12 w-12 rounded-lg ${className}`} />
      <span className="text-[10px] text-ink3">{label}</span>
    </div>
  );
}
