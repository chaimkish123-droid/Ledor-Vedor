'use client';

import { useEffect, useRef, useState } from 'react';
import type { CalendarPreference } from '@/lib/dates';

/**
 * The quieter half of the interface: how *you* like to see the family, and how
 * to bring another relative in. Neither changes what anyone else sees.
 */
export default function FamilyMenu({
  userName,
  calendar,
  isAdmin,
  onCalendarChange,
}: {
  userName: string;
  calendar: CalendarPreference;
  isAdmin: boolean;
  onCalendarChange: (value: CalendarPreference) => void;
}) {
  const [open, setOpen] = useState(false);
  const [invite, setInvite] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (!boxRef.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', onClick);
    return () => window.removeEventListener('mousedown', onClick);
  }, []);

  const createInvite = async () => {
    const response = await fetch('/api/invitations', { method: 'POST' });
    const data = await response.json();
    if (data.code) setInvite(`${window.location.origin}/join?code=${data.code}`);
  };

  const initials = userName
    .split(' ')
    .map((word) => word[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-label="Your settings and invitations"
        className="serif flex h-10 w-10 items-center justify-center rounded-full border border-stone-line bg-card text-[14px] text-sage-deep transition-colors hover:border-sage"
      >
        {initials}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-72 rounded-xl border border-stone-line bg-card p-4 card-shadow">
          <p className="text-[15px] text-ink">{userName}</p>

          <div className="mt-4">
            <p className="mb-2 text-[13px] uppercase tracking-wide text-ink-faint">Show dates as</p>
            <div className="flex gap-1.5">
              {(
                [
                  ['gregorian', 'Civil'],
                  ['hebrew', 'Hebrew'],
                  ['both', 'Both'],
                ] as [CalendarPreference, string][]
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => onCalendarChange(value)}
                  className={`flex-1 rounded-lg border px-2.5 py-2 text-[14px] transition-colors ${
                    calendar === value ? 'border-sage bg-sage-soft text-sage-deep' : 'border-stone-line text-ink-soft'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-[12px] text-ink-faint">Only you see this choice.</p>
          </div>

          <div className="mt-5 border-t border-stone-line pt-4">
            {invite ? (
              <>
                <p className="mb-1.5 text-[13px] uppercase tracking-wide text-ink-faint">Invitation link</p>
                <p className="break-all rounded-lg bg-parchment px-3 py-2 text-[13px] text-ink-soft">{invite}</p>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard?.writeText(invite);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }}
                  className="mt-2 w-full rounded-lg border border-stone-line px-3 py-2 text-[14px] text-ink transition-colors hover:border-sage"
                >
                  {copied ? 'Copied' : 'Copy link'}
                </button>
                <p className="mt-2 text-[12px] text-ink-faint">
                  Send this to one relative. They will be asked to find themselves in the family.
                </p>
              </>
            ) : (
              <button
                type="button"
                onClick={createInvite}
                className="w-full rounded-lg border border-stone-line px-3 py-2.5 text-[15px] text-ink transition-colors hover:border-sage"
              >
                Invite a relative
              </button>
            )}
          </div>

          <div className="mt-4 space-y-2 border-t border-stone-line pt-4">
            {isAdmin && (
              <>
                <a
                  href="/import"
                  className="block rounded-lg border border-stone-line px-3 py-2.5 text-center text-[15px] text-ink transition-colors hover:border-sage"
                >
                  Bring in a family tree
                </a>
                <a
                  href="/merge"
                  className="block rounded-lg border border-stone-line px-3 py-2.5 text-center text-[15px] text-ink transition-colors hover:border-sage"
                >
                  Find anyone recorded twice
                </a>
              </>
            )}
            <a
              href="/api/export/gedcom"
              className="block text-[14px] text-ink-soft underline underline-offset-2"
            >
              Download a copy of the family
            </a>
          </div>

          <form action="/api/auth/signout" method="post" className="mt-4 border-t border-stone-line pt-4">
            <button
              type="button"
              onClick={async () => {
                await fetch('/api/auth/signout', { method: 'POST' });
                window.location.href = '/';
              }}
              className="text-[14px] text-ink-soft underline underline-offset-2"
            >
              Sign out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
