import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth';
import { ensureSeeded } from '@/lib/seed';
import MergeClient from './MergeClient';

export const dynamic = 'force-dynamic';

export default async function MergePage() {
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
        <h1 className="serif text-3xl text-ink">When someone is here twice</h1>
        <p className="mt-2 max-w-xl text-[16px] leading-relaxed text-ink-soft">
          With several people adding to the family — and trees coming in from elsewhere — the same
          person occasionally ends up recorded twice, with half their life on each. Combining the two
          puts them back together and sets the relationships right.
        </p>

        <div className="mt-8">
          <MergeClient />
        </div>
      </main>
    </div>
  );
}
