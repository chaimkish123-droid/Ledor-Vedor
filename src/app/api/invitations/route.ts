import type { NextRequest } from 'next/server';
import { withUser } from '@/lib/api';
import { createInvitation, listInvitations } from '@/lib/auth';

export async function POST(request: NextRequest) {
  return withUser(async (user) => {
    const body = await request.json().catch(() => ({}));
    const code = createInvitation({ createdBy: user.id, note: body?.note, personId: body?.personId ?? null });
    return { code };
  });
}

export async function GET() {
  return withUser(() => ({ invitations: listInvitations() }));
}
