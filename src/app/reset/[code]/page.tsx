import Link from 'next/link';
import ResetForm from './ResetForm';

export const dynamic = 'force-dynamic';

/**
 * The page a relative lands on when someone has sent them a way back in.
 * Nothing is asked of them but a new password.
 */
export default async function ResetPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;

  return (
    <main id="main" className="flex min-h-dvh flex-col items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm fade-in">
        <Link href="/" className="mb-10 block text-center">
          <span className="hebrew serif text-3xl text-ink">לדור ודור</span>
        </Link>
        <ResetForm code={code} />
      </div>
    </main>
  );
}
