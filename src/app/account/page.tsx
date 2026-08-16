import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth';
import { ensureSeeded } from '@/lib/seed';
import PasswordForm from './PasswordForm';

export const dynamic = 'force-dynamic';

export default async function AccountPage() {
  ensureSeeded();
  const user = await currentUser();
  if (!user) redirect('/signin');

  return (
    <div className="min-h-dvh">
      <header className="border-b border-stone-line bg-parchment/90 px-4 py-3 sm:px-6">
        <div className="mx-auto flex max-w-xl items-center gap-3">
          <Link
            href="/tree"
            className="rounded-full border border-stone-line bg-card px-4 py-2 text-[14px] text-ink transition-colors hover:border-sage"
          >
            ← Family tree
          </Link>
          <span className="hebrew serif ml-auto text-[17px] text-ink-faint">לדור ודור</span>
        </div>
      </header>

      <main id="main" className="mx-auto max-w-xl px-5 pb-24 pt-10 sm:px-6">
        <h1 className="serif text-3xl text-ink">Your account</h1>
        <p className="mt-2 text-[16px] text-ink-soft">
          {user.displayName} · {user.email}
        </p>

        <section className="mt-10">
          <h2 className="serif text-[21px] text-ink">Change your password</h2>
          <p className="mt-1 text-[15px] text-ink-soft">
            Any other device you are signed in on will be signed out.
          </p>
          <div className="mt-4">
            <PasswordForm />
          </div>
        </section>

        <section className="mt-12 border-t border-stone-line pt-8">
          <h2 className="serif text-[21px] text-ink">If you are ever locked out</h2>
          <p className="mt-1 text-[16px] leading-relaxed text-ink-soft">
            There is no password email here — this archive is private, and keeping it that way means
            not relying on anyone&rsquo;s inbox. Ask whoever looks after the family archive and they can
            send you a link to set a new password.
          </p>
        </section>
      </main>
    </div>
  );
}
