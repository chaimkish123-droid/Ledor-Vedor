import type { NextRequest } from 'next/server';
import { actorOf, withUser } from '@/lib/api';
import { deleteMemory, updateMemoryVisibility } from '@/lib/repo';
import { isVisibility } from '@/lib/visibility';

/** Change who a memory is for. The author only. */
export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return withUser(async (user) => {
    const body = await request.json();
    if (!isVisibility(body?.visibility)) throw new Error('Choose who this memory is for.');
    updateMemoryVisibility(id, body.visibility, actorOf(user));
    return { ok: true };
  });
}

/** Take a memory back. The author, or an administrator clearing something up. */
export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return withUser((user) => {
    deleteMemory(id, actorOf(user), user.role === 'admin');
    return { ok: true };
  });
}
