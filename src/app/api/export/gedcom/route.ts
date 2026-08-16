import { currentUser } from '@/lib/auth';
import { exportGedcom } from '@/lib/export-gedcom';
import { NextResponse } from 'next/server';

/**
 * The whole family, in a format any other program can read.
 * Every signed-in family member can take a copy: it is their history too.
 */
export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });

  const text = exportGedcom();
  const stamp = new Date().toISOString().slice(0, 10);

  return new NextResponse(text, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Disposition': `attachment; filename="family-${stamp}.ged"`,
    },
  });
}
