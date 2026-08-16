import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth';
import { ensureSeeded } from '@/lib/seed';
import MembersClient from './MembersClient';

export const dynamic = 'force-dynamic';

export default async function MembersPage() {
  ensureSeeded();
  const user = await currentUser();
  if (!user) redirect('/signin');
  if (user.role !== 'admin') redirect('/tree');

  return (
    <div className="min-h-dvh">
      <header className="border-b border-stone-line bg-parchment/90 px-4 py-3 sm:px-6">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <Link
            href="/tree"
            className="rounded-full border border-stone-line bg-card px-4 py-2 text-[14px] text-ink transition-colors hover:border-sage"
          >
            ← Family tree
          </Link>
          <span className="hebrew serif ml-auto text-[17px] text-ink-faint">לדור ודור</span>
        </div>
      </header>

      <main id="main" className="mx-auto max-w-3xl px-5 pb-24 pt-10 sm:px-6">
        <h1 className="serif text-3xl text-ink">Who has an account</h1>
        <p className="mt-2 max-w-xl text-[16px] leading-relaxed text-ink-soft">
          Everyone here can sign in and add to the family. If somebody cannot get in — a forgotten
          password, a new phone — make them a link and send it the way you would normally reach them.
        </p>

        <div className="mt-8">
          <MembersClient />
        </div>
      </main>
    </div>
  );
}
