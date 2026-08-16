import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth';
import { ensureSeeded } from '@/lib/seed';
import ImportClient from './ImportClient';

export const dynamic = 'force-dynamic';

export default async function ImportPage() {
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
        <h1 className="serif text-3xl text-ink">Bring in a family tree</h1>
        <p className="mt-2 max-w-xl text-[16px] leading-relaxed text-ink-soft">
          If the family already has a tree somewhere else, there is no need to type it again. Export
          it from that program as a GEDCOM file and it can come straight in — names, dates, places,
          marriages and all.
        </p>

        <div className="mt-8">
          <ImportClient />
        </div>

        <section className="mt-16 border-t border-stone-line pt-8">
          <h2 className="serif text-[21px] text-ink">Taking a copy out</h2>
          <p className="mt-2 max-w-xl text-[16px] leading-relaxed text-ink-soft">
            This family&rsquo;s history belongs to the family, not to this application. Any member can
            download the whole thing in the same standard format, readable by any other genealogy
            program.
          </p>
          <a
            href="/api/export/gedcom"
            className="mt-4 inline-block rounded-full border border-stone-line bg-card px-5 py-3 text-[15px] text-ink transition-colors hover:border-sage"
          >
            Download the family as a GEDCOM file
          </a>
        </section>
      </main>
    </div>
  );
}
