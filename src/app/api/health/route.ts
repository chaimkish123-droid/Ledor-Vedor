import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

/** For the host's health check: is the process up and the archive readable? */
export async function GET() {
  try {
    // Confirm the archive is readable without saying anything about who is in
    // it: this endpoint is public so the host can check on the process.
    db().prepare('SELECT COUNT(*) AS n FROM person').get();
    return NextResponse.json({ status: 'ok' });
  } catch (error) {
    return NextResponse.json(
      { status: 'error', message: error instanceof Error ? error.message : 'unknown' },
      { status: 503 },
    );
  }
}
