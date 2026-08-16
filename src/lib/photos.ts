/**
 * Portraits.
 *
 * A person may have one photograph, shown on their card and at the top of their
 * profile. There is no album: this is a family tree, and the face is there so
 * you recognise someone at a glance, not so the application becomes a place to
 * keep pictures.
 *
 * Photographs are never required. The monogram is a finished design in its own
 * right, and a family that never uploads a single image should find nothing
 * missing.
 *
 * Images arrive already resized by the browser that sent them, which keeps a
 * twelve megabyte phone photograph from ever reaching the archive. The server
 * still checks that what arrived is genuinely an image, and reads its real
 * dimensions from the file header rather than believing what it was told.
 */

import { db, id as newId, now } from './db';
import { recordRevision, type Actor } from './repo';

export type Portrait = {
  id: string;
  personId: string;
  caption: string | null;
  takenText: string | null;
  width: number | null;
  height: number | null;
  bytes: number;
  contributorName: string | null;
  createdAt: string;
};

export type ImageFacts = { mime: string; width: number | null; height: number | null };

/** The largest a single photograph may be once the browser has resized it. */
export function maxPhotoBytes(): number {
  const configured = Number(process.env.LDOR_MAX_PHOTO_MB);
  const megabytes = Number.isFinite(configured) && configured > 0 ? configured : 8;
  return Math.floor(megabytes * 1024 * 1024);
}

/**
 * Identify an image from its own bytes.
 *
 * A content type in an upload is a claim, not a fact: the only trustworthy
 * description of a file is the file.
 */
export function readImageFacts(data: Buffer): ImageFacts | null {
  if (data.length < 16) return null;

  // PNG: 89 50 4E 47 0D 0A 1A 0A, then IHDR carries the dimensions.
  if (data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { mime: 'image/png', width: data.readUInt32BE(16), height: data.readUInt32BE(20) };
  }

  // JPEG: FF D8, then a start-of-frame marker holds the size.
  if (data[0] === 0xff && data[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < data.length) {
      if (data[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = data[offset + 1];
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return {
          mime: 'image/jpeg',
          height: data.readUInt16BE(offset + 5),
          width: data.readUInt16BE(offset + 7),
        };
      }
      const length = data.readUInt16BE(offset + 2);
      if (length <= 0) break;
      offset += 2 + length;
    }
    return { mime: 'image/jpeg', width: null, height: null };
  }

  // WebP: "RIFF" .... "WEBP"
  if (data.subarray(0, 4).toString('ascii') === 'RIFF' && data.subarray(8, 12).toString('ascii') === 'WEBP') {
    const format = data.subarray(12, 16).toString('ascii');
    if (format === 'VP8 ') {
      return { mime: 'image/webp', width: data.readUInt16LE(26) & 0x3fff, height: data.readUInt16LE(28) & 0x3fff };
    }
    if (format === 'VP8L') {
      const bits = data.readUInt32LE(21);
      return { mime: 'image/webp', width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
    }
    if (format === 'VP8X') {
      return {
        mime: 'image/webp',
        width: 1 + (data[24] | (data[25] << 8) | (data[26] << 16)),
        height: 1 + (data[27] | (data[28] << 8) | (data[29] << 16)),
      };
    }
    return { mime: 'image/webp', width: null, height: null };
  }

  return null;
}

/**
 * Give someone a portrait, replacing whatever was there.
 *
 * Replacing removes the previous image rather than quietly accumulating copies
 * nobody can see — with no album, an old portrait has nowhere to live.
 */
export function setPortrait(
  input: {
    personId: string;
    image: Buffer;
    thumb: Buffer;
    caption?: string | null;
    takenText?: string | null;
  },
  actor: Actor,
): string {
  const facts = readImageFacts(input.image);
  if (!facts) {
    throw new Error('That file does not look like a photograph. JPEG, PNG and WebP images all work.');
  }
  if (!readImageFacts(input.thumb)) {
    throw new Error('The smaller copy of that photograph could not be read.');
  }
  if (input.image.length > maxPhotoBytes()) {
    throw new Error(
      `That photograph is larger than ${Math.round(maxPhotoBytes() / (1024 * 1024))} MB even after resizing.`,
    );
  }

  const person = db().prepare('SELECT preferred_name FROM person WHERE id = ?').get(input.personId) as
    | { preferred_name: string }
    | undefined;
  if (!person) throw new Error('That person could not be found.');

  const photoId = newId();

  db().transaction(() => {
    const existing = db()
      .prepare('SELECT id FROM photo WHERE person_id = ?')
      .all(input.personId) as { id: string }[];

    db()
      .prepare(
        `INSERT INTO photo (id, person_id, caption, taken_text, mime, bytes, width, height, image, thumb,
                            contributor_id, contributor_name, created_at)
         VALUES (@id, @personId, @caption, @takenText, @mime, @bytes, @width, @height, @image, @thumb,
                 @contributorId, @contributorName, @createdAt)`,
      )
      .run({
        id: photoId,
        personId: input.personId,
        caption: input.caption?.trim() || null,
        takenText: input.takenText?.trim() || null,
        mime: facts.mime,
        bytes: input.image.length,
        width: facts.width,
        height: facts.height,
        image: input.image,
        thumb: input.thumb,
        contributorId: actor.id,
        contributorName: actor.name,
        createdAt: now(),
      });

    db().prepare('UPDATE person SET primary_photo_id = ? WHERE id = ?').run(photoId, input.personId);

    for (const old of existing) {
      db().prepare('DELETE FROM photo WHERE id = ?').run(old.id);
    }

    recordRevision({
      entityType: 'person',
      entityId: input.personId,
      action: 'update',
      field: 'Photograph',
      summary: existing.length
        ? `Replaced the photograph of ${person.preferred_name}`
        : `Added a photograph of ${person.preferred_name}`,
      actor,
    });
  })();

  return photoId;
}

export function removePortrait(personId: string, actor: Actor) {
  const person = db().prepare('SELECT preferred_name FROM person WHERE id = ?').get(personId) as
    | { preferred_name: string }
    | undefined;
  if (!person) throw new Error('That person could not be found.');

  db().transaction(() => {
    db().prepare('UPDATE person SET primary_photo_id = NULL WHERE id = ?').run(personId);
    db().prepare('DELETE FROM photo WHERE person_id = ?').run(personId);
    recordRevision({
      entityType: 'person',
      entityId: personId,
      action: 'update',
      field: 'Photograph',
      summary: `Removed the photograph of ${person.preferred_name}`,
      actor,
    });
  })();
}

export function portraitOf(personId: string): Portrait | null {
  const row = db()
    .prepare(
      `SELECT id, person_id, caption, taken_text, width, height, bytes, contributor_name, created_at
       FROM photo WHERE person_id = ?`,
    )
    .get(personId) as Record<string, any> | undefined;

  if (!row) return null;
  return {
    id: row.id,
    personId: row.person_id,
    caption: row.caption ?? null,
    takenText: row.taken_text ?? null,
    width: row.width ?? null,
    height: row.height ?? null,
    bytes: row.bytes,
    contributorName: row.contributor_name ?? null,
    createdAt: row.created_at,
  };
}

/** The image bytes, for serving. */
export function getPhotoBytes(photoId: string, size: 'full' | 'thumb'): { data: Buffer; mime: string } | null {
  const row = db()
    .prepare(`SELECT ${size === 'thumb' ? 'thumb' : 'image'} AS data, mime FROM photo WHERE id = ?`)
    .get(photoId) as { data: Buffer; mime: string } | undefined;
  return row ? { data: row.data, mime: row.mime } : null;
}

export function photoCount(): number {
  return (db().prepare('SELECT COUNT(*) AS n FROM photo').get() as { n: number }).n;
}
