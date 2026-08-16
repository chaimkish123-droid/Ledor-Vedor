'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import EditPersonForm from '@/components/EditPersonForm';
import PhotoUpload from '@/components/PhotoUpload';
import type { PersonDetail } from '@/lib/person-detail';

/**
 * Editing from the profile.
 *
 * The same details can be changed here as in the panel over the family tree,
 * using the same form — someone reading a life should not have to go back to
 * the tree to correct a date they just noticed was wrong.
 *
 * The photograph is handled here too. With no album to keep them in, a person
 * has one portrait: adding another replaces it, and removing it returns them
 * to their monogram.
 */
export default function ProfileEdit({ detail }: { detail: PersonDetail }) {
  const router = useRouter();
  const person = detail.person!;
  const [editing, setEditing] = useState(false);
  const [changingPhoto, setChangingPhoto] = useState(false);
  const [busy, setBusy] = useState(false);

  const removePhoto = async () => {
    setBusy(true);
    await fetch(`/api/photos/${detail.portrait?.id}?personId=${person.id}`, { method: 'DELETE' });
    setBusy(false);
    router.refresh();
  };

  if (editing) {
    return (
      <div className="mt-8 rounded-2xl border border-stone-line bg-card px-5 py-5">
        <h2 className="serif mb-4 text-[20px] text-ink">Correcting {person.preferredName.split(' ')[0]}&rsquo;s details</h2>
        <EditPersonForm
          detail={detail}
          onCancel={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            router.refresh();
          }}
        />
      </div>
    );
  }

  return (
    <>
      <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2">
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="rounded-full border border-stone-line bg-card px-5 py-2.5 text-[15px] text-ink transition-colors hover:border-sage"
        >
          Edit details
        </button>

        <button
          type="button"
          onClick={() => setChangingPhoto(true)}
          className="text-[14px] text-ink-soft underline underline-offset-2 hover:text-sage-deep"
        >
          {detail.portrait ? 'Change photograph' : 'Add a photograph'}
        </button>

        {detail.portrait && (
          <button
            type="button"
            onClick={removePhoto}
            disabled={busy}
            className="text-[14px] text-ink-faint underline underline-offset-2 hover:text-ink disabled:opacity-50"
          >
            Remove photograph
          </button>
        )}
      </div>

      {detail.portrait?.caption || detail.portrait?.takenText ? (
        <p className="mt-2 text-[13px] text-ink-faint">
          Photograph: {[detail.portrait.caption, detail.portrait.takenText].filter(Boolean).join(' · ')}
          {detail.portrait.contributorName ? ` · shared by ${detail.portrait.contributorName}` : ''}
        </p>
      ) : null}

      {changingPhoto && (
        <PhotoUpload
          personId={person.id}
          personName={person.preferredName}
          hasExisting={!!detail.portrait}
          onUploaded={() => {
            setChangingPhoto(false);
            router.refresh();
          }}
          onCancel={() => setChangingPhoto(false)}
        />
      )}
    </>
  );
}
