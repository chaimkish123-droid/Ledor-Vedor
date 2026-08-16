import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth';
import { ensureSeeded, needsFirstAccount } from '@/lib/seed';
import { personCount } from '@/lib/repo';

export const dynamic = 'force-dynamic';

export default async function WelcomePage() {
  ensureSeeded();
  // A brand new installation has nobody in it yet: someone has to go first.
  if (needsFirstAccount()) redirect('/setup');

  const user = await currentUser();
  const people = personCount();

  if (user && !user.onboarded) redirect('/onboarding');

  return (
    <main id="main" className="min-h-dvh flex flex-col items-center justify-center px-6 py-16">
      <div className="w-full max-w-xl text-center fade-in">
        <p className="hebrew serif text-5xl sm:text-6xl text-ink mb-3">לדור ודור</p>
        <h1 className="serif text-2xl sm:text-3xl text-ink-soft font-normal tracking-wide mb-8">
          L&rsquo;Dor VaDor
        </h1>

        <div className="mx-auto mb-10 h-px w-16 bg-stone-line" />

        <p className="serif text-xl sm:text-2xl leading-relaxed text-ink mb-3">
          Our family. Our stories. Our legacy.
        </p>
        <p className="text-ink-soft leading-relaxed mb-12 max-w-md mx-auto">
          A private place to see how our family fits together, and to keep the lives behind the names
          for the generations after us.
        </p>

        {user ? (
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/tree"
              className="rounded-full bg-sage px-8 py-4 text-white text-lg hover:bg-sage-deep transition-colors"
            >
              Explore the family tree
            </Link>
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/signin"
              className="rounded-full bg-sage px-8 py-4 text-white text-lg hover:bg-sage-deep transition-colors"
            >
              Sign in
            </Link>
            <Link
              href="/join"
              className="rounded-full border border-stone-line bg-card px-8 py-4 text-ink text-lg hover:border-sage transition-colors"
            >
              Join the family
            </Link>
          </div>
        )}

        <p className="mt-14 text-sm text-ink-faint">
          {people.toLocaleString()} people in the family so far · Private to invited family members
        </p>
      </div>
    </main>
  );
}
