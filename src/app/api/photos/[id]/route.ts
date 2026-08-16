import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/auth';
import { actorOf, withUser } from '@/lib/api';
import { getPhotoBytes, removePortrait } from '@/lib/photos';

/** Serve a photograph. Private to the family, like everything else here. */
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });

  const { id } = await context.params;
  const size = request.nextUrl.searchParams.get('size') === 'thumb' ? 'thumb' : 'full';
  const photo = getPhotoBytes(id, size);
  if (!photo) return NextResponse.json({ error: 'Not found.' }, { status: 404 });

  // The bytes behind an id never change, so this can be cached hard — but only
  // in the viewer's own browser, never in a shared cache.
  return new NextResponse(new Uint8Array(photo.data), {
    headers: {
      'Content-Type': photo.mime,
      'Cache-Control': 'private, max-age=31536000, immutable',
      'Content-Length': String(photo.data.length),
    },
  });
}

export async function DELETE(request: NextRequest) {
  return withUser(async (user) => {
    const personId = request.nextUrl.searchParams.get('personId');
    if (!personId) throw new Error('Whose photograph should be removed?');
    removePortrait(personId, actorOf(user));
    return { ok: true };
  });
}
