import type { NextRequest } from 'next/server';
import { actorOf, withUser } from '@/lib/api';
import { createResetCode, listMembers } from '@/lib/passwords';
import { listInvitations } from '@/lib/auth';

export async function GET() {
  return withUser((user) => {
    if (user.role !== 'admin') throw new Error('Only a family administrator can see who has an account.');
    return {
      members: listMembers(),
      invitations: listInvitations()
        .filter((invitation) => !invitation.used_by)
        .map((invitation) => ({
          code: invitation.code,
          createdAt: invitation.created_at,
          expiresAt: invitation.expires_at,
        })),
    };
  });
}

/** A way back in for a relative who cannot sign in. */
export async function POST(request: NextRequest) {
  return withUser(async (user) => {
    if (user.role !== 'admin') throw new Error('Only a family administrator can do this.');
    const body = await request.json();
    if (!body?.userId) throw new Error('Which family member?');
    return createResetCode(String(body.userId), actorOf(user));
  });
}
