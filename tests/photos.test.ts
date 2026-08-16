import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';
import {
  getPhotoBytes,
  photoCount,
  portraitOf,
  readImageFacts,
  removePortrait,
  setPortrait,
} from '../src/lib/photos.ts';
import { createPerson, getSummary, revisionsFor, searchPersons } from '../src/lib/repo.ts';
import { restoreBackup, takeBackup } from '../src/lib/backup.ts';

const actor = { id: null, name: 'Test' };

/** A real PNG, built by hand so the tests need no fixture files. */
function png(width: number, height: number): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crcTable = Array.from({ length: 256 }, (_, n) => {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      return c >>> 0;
    });
    let crc = 0xffffffff;
    for (const byte of body) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
    const crcBuffer = Buffer.alloc(4);
    crcBuffer.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
    return Buffer.concat([length, body, crcBuffer]);
  };

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // truecolour

  // One filter byte plus three bytes per pixel, per row.
  const raw = Buffer.concat(
    Array.from({ length: height }, () => Buffer.concat([Buffer.from([0]), Buffer.alloc(width * 3, 0x88)])),
  );

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

test('an image is identified from its own bytes, not from what it claims', () => {
  const facts = readImageFacts(png(120, 80));
  assert.equal(facts?.mime, 'image/png');
  assert.equal(facts?.width, 120);
  assert.equal(facts?.height, 80);

  // A JPEG, down to the frame marker that carries the size.
  const jpeg = Buffer.concat([
    Buffer.from([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08]),
    Buffer.from([0x01, 0x2c, 0x01, 0x90]), // 300 high, 400 wide
    Buffer.alloc(16),
  ]);
  const jpegFacts = readImageFacts(jpeg);
  assert.equal(jpegFacts?.mime, 'image/jpeg');
  assert.equal(jpegFacts?.height, 300);
  assert.equal(jpegFacts?.width, 400);

  assert.equal(readImageFacts(Buffer.from('this is definitely not an image at all')), null);
});

test('a portrait is stored, served, and shown on the person', () => {
  const personId = createPerson({ preferredName: 'Rivka Sofer' }, actor);
  assert.equal(getSummary(personId)!.photoId ?? null, null, 'they start with a monogram');

  const photoId = setPortrait(
    { personId, image: png(400, 400), thumb: png(80, 80), caption: 'On the porch', takenText: 'Summer 1972' },
    actor,
  );

  const portrait = portraitOf(personId)!;
  assert.equal(portrait.id, photoId);
  assert.equal(portrait.caption, 'On the porch');
  assert.equal(portrait.takenText, 'Summer 1972');
  assert.equal(portrait.width, 400);

  assert.equal(getSummary(personId)!.photoId, photoId, 'their card now has a face');

  const full = getPhotoBytes(photoId, 'full')!;
  const thumb = getPhotoBytes(photoId, 'thumb')!;
  assert.equal(full.mime, 'image/png');
  assert.ok(thumb.data.length < full.data.length, 'the small copy really is smaller');
});

test('a new portrait replaces the old one rather than piling up', () => {
  const personId = createPerson({ preferredName: 'Yitzchak Sofer' }, actor);
  const before = photoCount();

  setPortrait({ personId, image: png(300, 300), thumb: png(60, 60) }, actor);
  const first = portraitOf(personId)!;

  setPortrait({ personId, image: png(320, 320), thumb: png(64, 64) }, actor);
  const second = portraitOf(personId)!;

  assert.notEqual(second.id, first.id);
  assert.equal(photoCount(), before + 1, 'one person, one photograph');
  assert.equal(getPhotoBytes(first.id, 'full'), null, 'the replaced image is gone, not orphaned');
  assert.equal(getSummary(personId)!.photoId, second.id);
});

test('removing a portrait returns them to their monogram', () => {
  const personId = createPerson({ preferredName: 'Menucha Sofer' }, actor);
  setPortrait({ personId, image: png(200, 200), thumb: png(40, 40) }, actor);

  removePortrait(personId, actor);

  assert.equal(portraitOf(personId), null);
  assert.equal(getSummary(personId)!.photoId ?? null, null);
  assert.ok(
    revisionsFor('person', personId).some((revision) => revision.summary?.startsWith('Removed the photograph')),
    'and the change is recorded like any other',
  );
});

test('anything that is not an image is refused', () => {
  const personId = createPerson({ preferredName: 'Baruch Sofer' }, actor);
  assert.throws(
    () => setPortrait({ personId, image: Buffer.from('<script>not a photo</script>'), thumb: png(40, 40) }, actor),
    /does not look like a photograph/,
  );
  assert.equal(portraitOf(personId), null);
});

test('photographs survive a backup and restore', async () => {
  // This is the whole reason images live in the database rather than beside it:
  // the family's one-file backup has to include their faces.
  const personId = createPerson({ preferredName: 'Zlata Sofer' }, actor);
  setPortrait({ personId, image: png(500, 400), thumb: png(100, 80), caption: 'At the shop' }, actor);
  const original = getPhotoBytes(portraitOf(personId)!.id, 'full')!;

  const backup = await takeBackup('test-photos');

  removePortrait(personId, actor);
  assert.equal(portraitOf(personId), null);

  await restoreBackup(backup.path);

  const restored = portraitOf(personId);
  assert.ok(restored, 'the photograph came back with the archive');
  assert.equal(restored!.caption, 'At the shop');

  const bytes = getPhotoBytes(restored!.id, 'full')!;
  assert.ok(bytes.data.equals(original.data), 'byte for byte, the same photograph');
  assert.ok(
    searchPersons('Zlata').some((hit) => hit.person.photoId === restored!.id),
    'and the card still shows it',
  );
});
