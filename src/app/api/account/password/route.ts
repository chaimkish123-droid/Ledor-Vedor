import type { NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { withUser } from '@/lib/api';
import { changeOwnPassword } from '@/lib/passwords';

export async function POST(request: NextRequest) {
  return withUser(async (user) => {
    const body = await request.json();
    const store = await cookies();
    changeOwnPassword(
      user.id,
      String(body?.current ?? ''),
      String(body?.next ?? ''),
      store.get('ldor_session')?.value ?? null,
    );
    return { ok: true };
  });
}
