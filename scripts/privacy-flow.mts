/**
 * Two family members, two browsers. What one marks private must be invisible
 * to the other — on the page, and in search.
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE ?? 'http://localhost:3160';
const OUT = '/tmp/flows';

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
});
const results: [string, boolean, string][] = [];
const check = (name: string, ok: boolean, note = '') => {
  results.push([name, ok, note]);
  console.log(`${ok ? '  ok' : 'FAIL'}  ${name}${note ? ` — ${note}` : ''}`);
};

const signIn = async (email: string, password: string) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  const page = await context.newPage();
  await page.goto(`${BASE}/signin`);
  await page.fill('input[type=email]', email);
  await page.fill('input[type=password]', password);
  await page.click('button[type=submit]');
  await page.waitForURL('**/tree', { timeout: 15000 });
  return page;
};

// Michael, who is in the family, writes about his grandfather.
const michael = await signIn('demo@ldorvador.family', 'family');
await michael.goto(`${BASE}/tree`);
await michael.waitForTimeout(1200);
await michael.fill('input[type=search]', 'Avraham');
await michael.waitForTimeout(900);
await michael.keyboard.press('Enter');
await michael.waitForTimeout(1600);
await michael.getByRole('link', { name: 'Full profile' }).click();
await michael.waitForURL('**/person/**');
await michael.waitForTimeout(1200);

await michael.getByRole('button', { name: /Add a memory of Avraham/ }).click();
await michael.waitForTimeout(500);
await michael.getByLabel('Memory title').fill('Something I am still deciding about');
await michael.getByLabel('The memory', { exact: true }).fill('A private note mentioning kaleidoscope, not for the family yet.');
await michael.getByRole('button', { name: 'Just me for now' }).click();
await michael.waitForTimeout(300);
await michael.screenshot({ path: `${OUT}/40-visibility-chooser.png` });
await michael.getByRole('button', { name: 'Save' }).click();
await michael.waitForTimeout(2000);

const authorSees = await michael.getByText(/kaleidoscope/).isVisible().catch(() => false);
check('the author can read what they wrote', authorSees);
const marked = await michael.getByText('Only you can see this').isVisible().catch(() => false);
check('and it says plainly that nobody else can', marked);
await michael.screenshot({ path: `${OUT}/41-private-memory.png` });

// A second relative joins the family and looks at the same person.
const code = await michael.evaluate(async () => {
  const response = await fetch('/api/invitations', { method: 'POST' });
  const data = await response.json();
  return data.code as string;
});

const guest = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
const cousin = await guest.newPage();
await cousin.goto(`${BASE}/join?code=${code}`);
await cousin.waitForTimeout(700);
await cousin.getByLabel('Your name').fill('Talia Kish');
await cousin.getByLabel('Email').fill('talia@example.test');
await cousin.getByLabel('Choose a password').fill('a-good-password');
await cousin.getByRole('button', { name: 'Join' }).click();
await cousin.waitForURL('**/onboarding', { timeout: 15000 });
await cousin.waitForTimeout(800);
// She has not found herself in the family yet, which is allowed.
await cousin.getByRole('button', { name: 'Skip for now' }).click();
await cousin.waitForURL('**/tree', { timeout: 15000 });
await cousin.waitForTimeout(1200);

// She looks at the same profile.
const url = michael.url();
await cousin.goto(url);
await cousin.waitForTimeout(1500);

const cousinSees = await cousin.getByText(/kaleidoscope/).isVisible().catch(() => false);
check('another relative cannot read a private memory', !cousinSees);
await cousin.screenshot({ path: `${OUT}/42-other-relative.png` });

// And it must not surface through search either.
await cousin.goto(`${BASE}/tree`);
await cousin.waitForTimeout(1500);
await cousin.fill('input[type=search]', 'kaleidoscope');
await cousin.waitForTimeout(1200);
const nothingFound = await cousin.getByText('Nobody by that name yet.').isVisible().catch(() => false);
check('and it does not surface through search', nothingFound);
await cousin.screenshot({ path: `${OUT}/43-search-no-leak.png` });

// The author changes their mind, and now everyone may read it.
await michael.reload();
await michael.waitForTimeout(1200);
await michael
  .locator('article')
  .filter({ hasText: 'kaleidoscope' })
  .getByRole('button', { name: 'Everyone in the family' })
  .click();
await michael.waitForTimeout(1800);

await cousin.goto(url);
await cousin.waitForTimeout(1500);
const nowVisible = await cousin.getByText(/kaleidoscope/).isVisible().catch(() => false);
check('once shared with everyone, the same relative can read it', nowVisible);

// And the author can take it back entirely. Scoped to their own memory: an
// administrator sees a Remove on every card, which is a different power.
await michael.reload();
await michael.waitForTimeout(1200);
const ownCard = michael.locator('article').filter({ hasText: 'kaleidoscope' });
await ownCard.getByRole('button', { name: 'Remove', exact: true }).click();
await michael.waitForTimeout(400);
await ownCard.getByRole('button', { name: 'Yes, remove it' }).click();
await michael.waitForTimeout(2000);
const gone = !(await michael.getByText(/kaleidoscope/).isVisible().catch(() => false));
check('the author can take a memory back', gone);

await browser.close();
const failed = results.filter(([, ok]) => !ok);
console.log(`\n${results.length - failed.length}/${results.length} privacy checks passed.`);
if (failed.length) process.exitCode = 1;
