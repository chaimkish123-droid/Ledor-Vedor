import type { NextRequest } from 'next/server';
import { actorOf, withUser } from '@/lib/api';
import { maxPhotoBytes, setPortrait } from '@/lib/photos';

/**
 * Give someone their portrait. The browser sends an already-resized image and
 * a small copy for cards, so nothing enormous crosses the wire or lands in the
 * archive.
 */
export async function POST(request: NextRequest) {
  return withUser(async (user) => {
    const form = await request.formData();

    const image = form.get('image');
    const thumb = form.get('thumb');
    if (!(image instanceof File) || !(thumb instanceof File)) {
      throw new Error('No photograph was received.');
    }
    if (image.size > maxPhotoBytes()) {
      throw new Error(`That photograph is larger than ${Math.round(maxPhotoBytes() / (1024 * 1024))} MB.`);
    }

    const personId = String(form.get('personId') ?? '');
    if (!personId) throw new Error('Whose photograph is this?');

    const photoId = setPortrait(
      {
        personId,
        image: Buffer.from(await image.arrayBuffer()),
        thumb: Buffer.from(await thumb.arrayBuffer()),
        caption: (form.get('caption') as string) ?? null,
        takenText: (form.get('takenText') as string) ?? null,
      },
      actorOf(user),
    );

    return { photoId };
  });
}
