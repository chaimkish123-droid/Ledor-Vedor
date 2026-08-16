import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth';
import { ensureSeeded } from '@/lib/seed';
import { searchPersons } from '@/lib/repo';
import { db } from '@/lib/db';
import TreeClient from './TreeClient';

export const dynamic = 'force-dynamic';

export default async function TreePage() {
  ensureSeeded();
  const user = await currentUser();
  if (!user) redirect('/signin');
  if (!user.onboarded && !user.personId) redirect('/onboarding');

  // Somebody who skipped onboarding still needs a place to start.
  const fallback = db().prepare('SELECT id FROM person ORDER BY created_at LIMIT 1').get() as
    | { id: string }
    | undefined;
  const focusId = user.personId ?? fallback?.id;
  if (!focusId) redirect('/onboarding');

  return (
    <TreeClient
      initialFocusId={focusId}
      viewerPersonId={user.personId}
      userName={user.displayName}
      isAdmin={user.role === 'admin'}
    />
  );
}
