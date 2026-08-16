import { NextResponse } from 'next/server';
import { currentUser } from './auth';
import { ensureSeeded } from './seed';
import type { SessionUser } from './types';

/** Every API entry point runs through here: seed on first touch, then authenticate. */
export async function withUser<T>(
  handler: (user: SessionUser) => Promise<T> | T,
): Promise<NextResponse> {
  try {
    ensureSeeded();
    const user = await currentUser();
    if (!user) {
      return NextResponse.json({ error: 'Please sign in to see your family.' }, { status: 401 });
    }
    const result = await handler(user);
    return NextResponse.json(result ?? { ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Something went wrong.';
    console.error('[ldor]', error);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function withoutUser<T>(handler: () => Promise<T> | T): Promise<NextResponse> {
  try {
    ensureSeeded();
    const result = await handler();
    return NextResponse.json(result ?? { ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Something went wrong.';
    console.error('[ldor]', error);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export function actorOf(user: SessionUser) {
  return { id: user.id, name: user.displayName };
}
