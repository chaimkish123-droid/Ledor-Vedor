import type { NextRequest } from 'next/server';
import { withUser } from '@/lib/api';
import { getPref, setPref } from '@/lib/repo';

/** Viewing preferences belong to the viewer and never touch shared family data. */
export async function POST(request: NextRequest) {
  return withUser(async (user) => {
    const body = await request.json();
    for (const [key, value] of Object.entries(body ?? {})) {
      setPref(user.id, key, String(value));
    }
    return { ok: true };
  });
}

export async function GET() {
  return withUser((user) => ({
    calendar: getPref(user.id, 'calendar') ?? 'gregorian',
    density: getPref(user.id, 'density') ?? 'spacious',
    startingBranch: getPref(user.id, 'startingBranch') ?? 'mine',
  }));
}
