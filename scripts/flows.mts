/**
 * End-to-end check of the paths that change family data.
 * Runs against a live server; reports each step rather than asserting silently.
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE ?? 'http://localhost:3105';
const OUT = process.env.SHOT_DIR ?? '/tmp/flows';

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

const results: [string, boolean, string][] = [];
const check = (name: string, ok: boolean, note = '') => {
  results.push([name, ok, note]);
  console.log(`${ok ? '  ok' : 'FAIL'}  ${name}${note ? ` — ${note}` : ''}`);
};

await page.goto(`${BASE}/signin`);
await page.fill('input[type=email]', 'demo@ldorvador.family');
await page.fill('input[type=password]', 'family');
await page.click('button[type=submit]');
await page.waitForURL('**/tree');
await page.waitForTimeout(1500);
check('sign in', page.url().includes('/tree'));

/* --- Add a relative, with duplicate detection ---------------------- */

await page.getByRole('button', { name: /Michael Kish/ }).first().click();
await page.waitForTimeout(700);
await page.getByRole('button', { name: 'Add child' }).click();
await page.waitForTimeout(500);

// Type a name that already exists to trigger the duplicate warning.
await page.getByLabel('Name').fill('Ethan Kish');
await page.waitForTimeout(900);
const duplicateShown = await page.getByText('We may already have this person.').isVisible().catch(() => false);
check('duplicate detection warns before creating', duplicateShown);
await page.screenshot({ path: `${OUT}/01-duplicate.png` });

// Now add someone genuinely new.
await page.getByLabel('Name').fill('Tamar Kish');
await page.getByLabel('Born').fill('2011');
await page.waitForTimeout(900);
await page.getByRole('button', { name: /Add Tamar to the family/ }).click();
await page.waitForTimeout(2000);

const tamarOnCanvas = await page.getByRole('button', { name: /Tamar Kish/ }).first().isVisible().catch(() => false);
check('new child appears on the canvas immediately', tamarOnCanvas);
await page.screenshot({ path: `${OUT}/02-added.png` });

/* --- The relationship engine picks the new person up --------------- */

const relation = await page
  .locator('aside')
  .getByText(/Your (daughter|son|child|niece|nephew|grand)/)
  .first()
  .textContent()
  .catch(() => null);
check('relationship to the viewer is calculated for the new person', !!relation, relation ?? 'not found');

/* --- Edit a fact --------------------------------------------------- */

await page.getByRole('button', { name: 'Edit details' }).click();
await page.waitForTimeout(400);
await page.getByLabel('Born').fill('c. 2011');
await page.getByRole('button', { name: 'Save' }).click();
await page.waitForTimeout(1200);
const edited = await page.getByText('c. 2011').first().isVisible().catch(() => false);
check('editing a date works and keeps the approximation', edited);

/* --- Calendar preference ------------------------------------------- */

await page.keyboard.press('Escape');
await page.getByRole('button', { name: 'Your settings and invitations' }).click();
await page.waitForTimeout(300);
await page.getByRole('button', { name: 'Both' }).click();
await page.waitForTimeout(800);
await page.keyboard.press('Escape');
await page.getByRole('button', { name: /David Kish/ }).first().click();
await page.waitForTimeout(1400);
const hebrewDate = await page
  .locator('aside')
  .getByText(/Iyar|Sivan|Tishrei|Av |Elul|Nisan|Adar|Shevat|Tevet|Kislev|Cheshvan|Tammuz/)
  .first()
  .isVisible()
  .catch(() => false);
check('Hebrew dates appear once chosen', hebrewDate);
await page.screenshot({ path: `${OUT}/03-hebrew-dates.png` });

/* --- Invitation ---------------------------------------------------- */

await page.keyboard.press('Escape');
await page.getByRole('button', { name: 'Your settings and invitations' }).click();
await page.waitForTimeout(300);
await page.getByRole('button', { name: 'Invite a relative' }).click();
await page.waitForTimeout(900);
const inviteLink = await page.getByText(/\/join\?code=/).first().textContent().catch(() => null);
check('invitation link is created', !!inviteLink);
await page.screenshot({ path: `${OUT}/04-invite.png` });

/* --- A memory, contributed from the profile ------------------------ */

await page.goto(`${BASE}/tree`);
await page.waitForTimeout(1200);
await page.getByRole('button', { name: /Michael Kish/ }).first().click();
await page.waitForTimeout(700);
await page.getByRole('link', { name: 'Full profile' }).click();
await page.waitForTimeout(1400);
await page.getByRole('button', { name: /Add a memory of Michael/ }).click();
await page.waitForTimeout(400);
await page.locator('textarea').fill('He taught all of us to ride bicycles in the park behind the shop.');
await page.getByRole('button', { name: 'Save' }).click();
await page.waitForTimeout(1600);
const memorySaved = await page.getByText(/taught all of us to ride bicycles/).isVisible().catch(() => false);
check('a memory can be added from the profile', memorySaved);
await page.screenshot({ path: `${OUT}/05-memory.png`, fullPage: false });

/* --- Search reaches past names ------------------------------------- */

await page.goto(`${BASE}/tree`);
await page.waitForTimeout(1200);
await page.fill('input[type=search]', 'Krak');
await page.waitForTimeout(900);
const placeContext = await page.getByText(/born in Kraków/).first().isVisible().catch(() => false);
check('search finds people by place, and says why', placeContext);
await page.screenshot({ path: `${OUT}/06-search-place.png` });

await page.fill('input[type=search]', 'bookbinding');
await page.waitForTimeout(900);
const storyContext = await page.getByText(/in a memory —/).first().isVisible().catch(() => false);
check('search reaches inside memories', storyContext);
await page.screenshot({ path: `${OUT}/07-search-story.png` });

/* --- Revision history recorded the changes ------------------------- */

await page.goto(`${BASE}/tree`);
await page.waitForTimeout(1200);
await page.getByRole('button', { name: /Tamar Kish/ }).first().click().catch(() => {});
await page.waitForTimeout(700);
await page.getByRole('link', { name: 'Full profile' }).click();
await page.waitForTimeout(1400);
const historyShown = await page.getByText(/recorded change/).isVisible().catch(() => false);
check('revision history records what changed', historyShown);

/* --- A mistaken edit can be put back ------------------------------- */

await page.getByText(/recorded change/).click();
await page.waitForTimeout(400);
const restore = page.getByRole('button', { name: 'Put this back' });
const canRestore = (await restore.count()) > 0;
check('an administrator is offered a way to put a value back', canRestore);

if (canRestore) {
  await page.screenshot({ path: `${OUT}/08-history.png` });
  await restore.first().click();
  await page.waitForTimeout(1800);
  const restored = await page.getByText(/Restored/).first().isVisible().catch(() => false);
  check('restoring records itself as a change rather than erasing one', restored);
  await page.screenshot({ path: `${OUT}/09-restored.png` });
}

await browser.close();

const failed = results.filter(([, ok]) => !ok);
console.log(`\n${results.length - failed.length}/${results.length} flows passed.`);
if (failed.length) process.exitCode = 1;
