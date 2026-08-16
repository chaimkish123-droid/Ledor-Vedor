import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { needsFirstAccount } from '@/lib/seed';
import SetupForm from './SetupForm';

export const dynamic = 'force-dynamic';

/**
 * The very first screen of a new family archive: someone has to go first.
 * Once an account exists this page is gone for good.
 */
export default async function SetupPage() {
  // Touch the database so the schema exists before we ask it anything.
  db();
  if (!needsFirstAccount()) redirect('/signin');

  return (
    <main id="main" className="flex min-h-dvh flex-col items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm fade-in">
        <p className="hebrew serif mb-2 text-center text-4xl text-ink">לדור ודור</p>
        <p className="serif mb-10 text-center text-[17px] tracking-wide text-ink-soft">L&rsquo;Dor VaDor</p>

        <h1 className="serif mb-2 text-center text-2xl text-ink">Begin your family&rsquo;s archive</h1>
        <p className="mb-8 text-center text-[15px] leading-relaxed text-ink-soft">
          This space is empty. Create the first account, and you can invite the rest of the family
          once you are in.
        </p>

        <SetupForm />
      </div>
    </main>
  );
}
