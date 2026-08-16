'use client';

import { useRef, useState } from 'react';

/**
 * One photograph per person: their portrait.
 *
 * Resizing happens here, in the browser, before anything is sent. A photograph
 * off a phone is often twelve megabytes of detail nobody will ever look at, so
 * two copies are made — one to look at, one for the small round face on a card
 * — and only those are uploaded.
 */
const DISPLAY_EDGE = 1600;
const THUMB_EDGE = 320;

async function resize(file: File, longestEdge: number, quality: number): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, longestEdge / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext('2d');
  if (!context) throw new Error('This browser could not prepare the photograph.');
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', quality),
  );
  if (!blob) throw new Error('This browser could not prepare the photograph.');
  return blob;
}

export default function PhotoUpload({
  personId,
  personName,
  hasExisting = false,
  onUploaded,
  onCancel,
}: {
  personId: string;
  personName: string;
  /** Whether this will replace a portrait they already have. */
  hasExisting?: boolean;
  onUploaded: (photoId: string) => void;
  onCancel: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [takenText, setTakenText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const choose = (chosen: File) => {
    setError(null);
    setFile(chosen);
    setPreviewUrl(URL.createObjectURL(chosen));
  };

  const upload = async () => {
    if (!file) return;
    setBusy(true);
    setError(null);

    try {
      const [image, thumb] = await Promise.all([
        resize(file, DISPLAY_EDGE, 0.82),
        resize(file, THUMB_EDGE, 0.8),
      ]);

      const form = new FormData();
      form.set('image', new File([image], 'photo.jpg', { type: 'image/jpeg' }));
      form.set('thumb', new File([thumb], 'thumb.jpg', { type: 'image/jpeg' }));
      form.set('personId', personId);
      form.set('caption', caption);
      form.set('takenText', takenText);

      const response = await fetch('/api/photos', { method: 'POST', body: form });
      const data = await response.json();
      if (data.error) throw new Error(data.error);

      onUploaded(data.photoId);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'That photograph could not be added.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/20 p-0 sm:items-center sm:p-6">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Add a photograph of ${personName}`}
        className="sheet-in soft-scroll max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl bg-card px-5 py-6 panel-shadow sm:max-w-md sm:rounded-2xl"
      >
        <div className="mb-5 flex items-start justify-between gap-3">
          <h2 className="serif text-[21px] leading-tight text-ink">
            {hasExisting ? 'A different photograph of' : 'A photograph of'} {personName.split(' ')[0]}
          </h2>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Close"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink-faint hover:bg-parchment hover:text-ink"
          >
            ✕
          </button>
        </div>

        <input
          ref={inputRef}
          id="photo-file"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          onChange={(event) => {
            const chosen = event.target.files?.[0];
            if (chosen) choose(chosen);
          }}
        />

        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previewUrl}
            alt="The photograph you chose"
            className="mb-4 max-h-72 w-full rounded-xl object-contain"
          />
        ) : (
          <label
            htmlFor="photo-file"
            className="mb-4 flex cursor-pointer flex-col items-center rounded-xl border border-dashed border-stone-line bg-parchment px-6 py-10 text-center transition-colors hover:border-sage"
          >
            <span className="text-[16px] text-ink">Choose a photograph</span>
            <span className="mt-1 text-[13px] text-ink-faint">
              It is made smaller on this device before it is sent.
            </span>
          </label>
        )}

        <div className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-[13px] uppercase tracking-wide text-ink-faint">Caption</span>
            <input
              type="text"
              value={caption}
              onChange={(event) => setCaption(event.target.value)}
              placeholder="What is happening here?"
              className="w-full rounded-lg border border-stone-line bg-parchment px-3 py-2.5 text-[16px] text-ink"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-[13px] uppercase tracking-wide text-ink-faint">When</span>
            <input
              type="text"
              value={takenText}
              onChange={(event) => setTakenText(event.target.value)}
              placeholder="Summer 1972"
              className="w-full rounded-lg border border-stone-line bg-parchment px-3 py-2.5 text-[15px] text-ink"
            />
          </label>
        </div>

        {hasExisting && (
          <p className="mt-4 text-[13px] text-ink-faint">
            This replaces the photograph {personName.split(' ')[0]} has now.
          </p>
        )}

        {error && <p className="mt-4 text-[14px] text-red-700">{error}</p>}

        <div className="mt-6 flex gap-2">
          <button
            type="button"
            onClick={upload}
            disabled={busy || !file}
            className="flex-1 rounded-lg bg-sage px-4 py-3 text-[16px] text-white transition-colors hover:bg-sage-deep disabled:opacity-50"
          >
            {busy ? 'Adding…' : 'Add the photograph'}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-stone-line px-4 py-3 text-ink transition-colors hover:border-ink-faint"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
