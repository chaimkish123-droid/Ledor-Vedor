'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';
import type { ImportPreview, ImportOutcome } from '@/lib/import-gedcom';

/**
 * Import is deliberately two steps. Bringing hundreds of people into a family
 * archive is not something anyone should do from a single click and a hope —
 * the reader sees what will happen, decides who is already here, and only then
 * confirms.
 */
export default function ImportClient() {
  const [fileName, setFileName] = useState<string | null>(null);
  const [text, setText] = useState<string>('');
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [linkTo, setLinkTo] = useState<Record<string, string>>({});
  const [outcome, setOutcome] = useState<ImportOutcome | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const choose = async (file: File) => {
    setError(null);
    setOutcome(null);
    setFileName(file.name);
    setBusy(true);

    const contents = await file.text();
    setText(contents);

    const response = await fetch('/api/import/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: contents,
    });
    const data = await response.json();
    setBusy(false);

    if (data.error) {
      setError(data.error);
      setPreview(null);
      return;
    }

    setPreview(data);
    // Default to joining anyone who is very likely already here.
    const defaults: Record<string, string> = {};
    for (const match of data.matches ?? []) {
      if (match.confidence >= 0.85) defaults[match.xref] = match.existingId;
    }
    setLinkTo(defaults);
  };

  const apply = async () => {
    setBusy(true);
    setError(null);
    const response = await fetch('/api/import/apply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, linkTo }),
    });
    const data = await response.json();
    setBusy(false);
    if (data.error) return setError(data.error);
    setOutcome(data);
    setPreview(null);
  };

  return (
    <div className="space-y-8">
      {/* Choose a file */}
      {!preview && !outcome && (
        <div>
          <input
            ref={inputRef}
            type="file"
            accept=".ged,.gedcom,text/plain"
            className="sr-only"
            id="gedcom-file"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) choose(file);
            }}
          />
          <label
            htmlFor="gedcom-file"
            className="flex cursor-pointer flex-col items-center rounded-2xl border border-dashed border-stone-line bg-card px-6 py-12 text-center transition-colors hover:border-sage"
          >
            <span className="serif text-[19px] text-ink">Choose a GEDCOM file</span>
            <span className="mt-1 text-[15px] text-ink-soft">
              The <code className="text-[14px]">.ged</code> file exported from Ancestry, MyHeritage,
              FamilySearch, Geni or similar.
            </span>
          </label>
          {busy && <p className="mt-4 text-center text-[15px] text-ink-soft">Reading {fileName}…</p>}
        </div>
      )}

      {error && (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[15px] text-red-800">{error}</p>
      )}

      {/* What would happen */}
      {preview && (
        <>
          <section>
            <h2 className="serif mb-1 text-[21px] text-ink">
              {preview.counts.people} {preview.counts.people === 1 ? 'person' : 'people'} in {fileName}
            </h2>
            <p className="text-[15px] text-ink-soft">
              {preview.counts.families} {preview.counts.families === 1 ? 'family' : 'families'} ·{' '}
              {preview.counts.events} recorded {preview.counts.events === 1 ? 'event' : 'events'}
              {preview.source ? ` · exported from ${preview.source}` : ''}
            </p>

            <ul className="mt-4 space-y-1.5">
              {preview.sample.map((person, index) => (
                <li key={index} className="flex flex-wrap items-baseline gap-x-2 text-[15px]">
                  <span className="text-ink">{person.name}</span>
                  <span className="text-[14px] text-ink-faint">{person.years}</span>
                  <span className="text-[14px] text-ink-faint">{person.detail}</span>
                </li>
              ))}
              {preview.counts.people > preview.sample.length && (
                <li className="text-[14px] text-ink-faint">
                  …and {preview.counts.people - preview.sample.length} more
                </li>
              )}
            </ul>
          </section>

          {preview.matches.length > 0 && (
            <section>
              <h3 className="serif mb-1 text-[18px] text-ink">Some of these may already be here</h3>
              <p className="mb-3 text-[15px] text-ink-soft">
                Where you say the same person, their new relationships join the one we already have
                instead of creating a second record.
              </p>

              <ul className="space-y-2">
                {preview.matches.map((match) => {
                  const joined = linkTo[match.xref] === match.existingId;
                  return (
                    <li
                      key={match.xref}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-stone-line bg-card px-4 py-3"
                    >
                      <span className="min-w-0 text-[15px]">
                        <span className="text-ink">{match.incomingName}</span>{' '}
                        <span className="text-ink-faint">{match.incomingYears}</span>
                        <span className="block text-[14px] text-ink-faint">
                          looks like {match.existingName} {match.existingYears} — {match.reasons.join(', ')}
                        </span>
                      </span>

                      <label className="flex shrink-0 items-center gap-2 text-[14px] text-ink">
                        <input
                          type="checkbox"
                          checked={joined}
                          onChange={(event) =>
                            setLinkTo((current) => {
                              const next = { ...current };
                              if (event.target.checked) next[match.xref] = match.existingId;
                              else delete next[match.xref];
                              return next;
                            })
                          }
                          className="h-5 w-5 accent-[color:var(--color-sage)]"
                        />
                        Same person
                      </label>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {preview.warnings.length > 0 && (
            <section>
              <h3 className="serif mb-2 text-[18px] text-ink">Worth knowing</h3>
              <ul className="space-y-1.5 text-[14px] text-ink-soft">
                {preview.warnings.slice(0, 8).map((warning, index) => (
                  <li key={index}>· {warning}</li>
                ))}
                {preview.warnings.length > 8 && <li>· and {preview.warnings.length - 8} more like these</li>}
              </ul>
            </section>
          )}

          <div className="flex flex-wrap gap-2 border-t border-stone-line pt-6">
            <button
              type="button"
              onClick={apply}
              disabled={busy}
              className="rounded-full bg-sage px-6 py-3 text-[16px] text-white transition-colors hover:bg-sage-deep disabled:opacity-60"
            >
              {busy ? 'Importing…' : `Bring ${preview.counts.people} people into the family`}
            </button>
            <button
              type="button"
              onClick={() => {
                setPreview(null);
                setText('');
                setFileName(null);
                if (inputRef.current) inputRef.current.value = '';
              }}
              className="rounded-full border border-stone-line px-5 py-3 text-[15px] text-ink transition-colors hover:border-ink-faint"
            >
              Choose a different file
            </button>
          </div>

          <p className="text-[13px] text-ink-faint">
            The archive is backed up before anything is written, and the import either finishes
            completely or does nothing at all.
          </p>
        </>
      )}

      {/* What happened */}
      {outcome && (
        <section className="rounded-2xl border border-stone-line bg-card px-6 py-6">
          <h2 className="serif text-[21px] text-ink">The family has grown</h2>
          <ul className="mt-3 space-y-1 text-[16px] text-ink-soft">
            <li>{outcome.added} people added</li>
            {outcome.linked > 0 && <li>{outcome.linked} joined to someone already here</li>}
            <li>{outcome.unions} marriages</li>
            <li>{outcome.relationships} parent and child connections</li>
            {outcome.events > 0 && <li>{outcome.events} life events</li>}
          </ul>
          {outcome.backup && (
            <p className="mt-4 text-[13px] text-ink-faint">
              The archive as it stood beforehand was saved as {outcome.backup}.
            </p>
          )}
          <div className="mt-6 flex flex-wrap gap-2">
            <Link
              href="/tree"
              className="rounded-full bg-sage px-6 py-3 text-[16px] text-white transition-colors hover:bg-sage-deep"
            >
              See the family tree
            </Link>
            <button
              type="button"
              onClick={() => {
                setOutcome(null);
                setFileName(null);
                setText('');
              }}
              className="rounded-full border border-stone-line px-5 py-3 text-[15px] text-ink transition-colors hover:border-ink-faint"
            >
              Import another file
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
