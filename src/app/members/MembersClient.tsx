'use client';

import { useEffect, useState } from 'react';
import type { Member } from '@/lib/passwords';

type Invitation = { code: string; createdAt: string; expiresAt: string | null };

/**
 * Who has an account, and how to get somebody back in.
 *
 * There is no email here on purpose. An administrator makes a link and gives
 * it to their relative the way they already talk to them — which for most
 * families is faster and more certain than an email that lands in a folder
 * nobody opens.
 */
export default function MembersClient() {
  const [members, setMembers] = useState<Member[] | null>(null);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [link, setLink] = useState<{ name: string; url: string; expiresAt: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    fetch('/api/members')
      .then((response) => response.json())
      .then((data) => {
        if (data.error) return setError(data.error);
        setMembers(data.members);
        setInvitations(data.invitations ?? []);
      });
  };

  useEffect(load, []);

  const makeLink = async (member: Member) => {
    setError(null);
    const response = await fetch('/api/members', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: member.id }),
    });
    const data = await response.json();
    if (data.error) return setError(data.error);
    setLink({
      name: member.displayName,
      url: `${window.location.origin}/reset/${data.code}`,
      expiresAt: data.expiresAt,
    });
    setCopied(false);
  };

  return (
    <div>
      {error && <p className="mb-4 text-[15px] text-red-700">{error}</p>}

      {link && (
        <div className="mb-6 rounded-2xl border border-sage bg-sage-soft/40 px-5 py-4">
          <p className="text-[16px] text-ink">A way back in for {link.name}</p>
          <p className="mt-1 text-[14px] text-ink-soft">
            Send this to them however you normally would. It works once, and stops working{' '}
            {new Date(link.expiresAt).toLocaleDateString()}.
          </p>
          <p className="mt-3 break-all rounded-lg bg-card px-3 py-2 text-[13px] text-ink-soft">{link.url}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                navigator.clipboard?.writeText(link.url);
                setCopied(true);
              }}
              className="rounded-full border border-stone-line bg-card px-4 py-2 text-[14px] text-ink transition-colors hover:border-sage"
            >
              {copied ? 'Copied' : 'Copy the link'}
            </button>
            <button
              type="button"
              onClick={() => setLink(null)}
              className="text-[14px] text-ink-soft underline underline-offset-2"
            >
              Done
            </button>
          </div>
        </div>
      )}

      {members === null && <p className="text-[16px] text-ink-soft">Looking…</p>}

      {members && (
        <ul className="space-y-2">
          {members.map((member) => (
            <li
              key={member.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-stone-line bg-card px-4 py-3"
            >
              <span className="min-w-0">
                <span className="text-[16px] text-ink">{member.displayName}</span>
                {member.role === 'admin' && (
                  <span className="ml-2 rounded-full bg-sage-soft px-2 py-0.5 text-[12px] text-sage-deep">
                    Looks after the archive
                  </span>
                )}
                <span className="block text-[14px] text-ink-faint">
                  {member.email}
                  {member.personName ? ` · in the family as ${member.personName}` : ' · not yet placed in the family'}
                </span>
              </span>

              <button
                type="button"
                onClick={() => makeLink(member)}
                className="shrink-0 rounded-lg border border-stone-line px-4 py-2 text-[14px] text-ink transition-colors hover:border-sage"
              >
                They cannot sign in
              </button>
            </li>
          ))}
        </ul>
      )}

      {invitations.length > 0 && (
        <section className="mt-10">
          <h2 className="serif text-[19px] text-ink">Invitations waiting</h2>
          <p className="mt-1 text-[15px] text-ink-soft">
            {invitations.length} {invitations.length === 1 ? 'invitation has' : 'invitations have'} been sent and
            not used yet.
          </p>
        </section>
      )}
    </div>
  );
}
