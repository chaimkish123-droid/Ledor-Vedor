/** A relative forgets their password. An administrator gets them back in. */
import { chromium } from 'playwright';

const BASE = process.env.BASE ?? 'http://localhost:3170';
const OUT = '/tmp/flows';

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
});
const results: [string, boolean, string][] = [];
const check = (name: string, ok: boolean, note = '') => {
  results.push([name, ok, note]);
  console.log(`${ok ? '  ok' : 'FAIL'}  ${name}${note ? ` — ${note}` : ''}`);
};

// The administrator invites a relative, who joins with a password.
const adminContext = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
const admin = await adminContext.newPage();
await admin.goto(`${BASE}/signin`);
await admin.fill('input[type=email]', 'demo@ldorvador.family');
await admin.fill('input[type=password]', 'family');
await admin.click('button[type=submit]');
await admin.waitForURL('**/tree');

const code = await admin.evaluate(async () => {
  const response = await fetch('/api/invitations', { method: 'POST' });
  return (await response.json()).code as string;
});

const relativeContext = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
const relative = await relativeContext.newPage();
await relative.goto(`${BASE}/join?code=${code}`);
await relative.waitForTimeout(700);
await relative.getByLabel('Your name').fill('Bubbe Malka');
await relative.getByLabel('Email').fill('malka@example.test');
await relative.getByLabel('Choose a password').fill('the-password-she-forgets');
await relative.getByRole('button', { name: 'Join' }).click();
await relative.waitForURL('**/onboarding', { timeout: 15000 });
check('a relative joins with a password', true);

// Time passes. She cannot remember it.
await relativeContext.clearCookies();
await relative.goto(`${BASE}/signin`);
await relative.fill('input[type=email]', 'malka@example.test');
await relative.fill('input[type=password]', 'something-else-entirely');
await relative.click('button[type=submit]');
await relative.waitForTimeout(1200);
const refused = await relative.getByText(/do not match/).isVisible().catch(() => false);
check('the wrong password is refused', refused);
const toldWhatToDo = await relative.getByText(/Ask whoever looks after the family archive/).isVisible().catch(() => false);
check('and she is told plainly what to do about it', toldWhatToDo);
await relative.screenshot({ path: `${OUT}/50-locked-out.png` });

// The administrator finds her and makes a link.
await admin.goto(`${BASE}/members`);
await admin.waitForTimeout(1500);
const listed = await admin.getByText('Bubbe Malka').isVisible().catch(() => false);
check('the administrator can see who has an account', listed);
await admin.screenshot({ path: `${OUT}/51-members.png` });

await admin
  .locator('li')
  .filter({ hasText: 'Bubbe Malka' })
  .getByRole('button', { name: 'They cannot sign in' })
  .click();
await admin.waitForTimeout(1500);

const linkText = await admin.getByText(/\/reset\//).first().textContent();
check('a way back in is created', !!linkText);
await admin.screenshot({ path: `${OUT}/52-reset-link.png` });

// She uses it.
const resetUrl = (linkText ?? '').trim();
await relative.goto(resetUrl);
await relative.waitForTimeout(1500);
const greeted = await relative.getByText(/Welcome back, Bubbe/).isVisible().catch(() => false);
check('the link greets her by name', greeted);
await relative.screenshot({ path: `${OUT}/53-set-password.png` });

await relative.getByLabel('New password').fill('a-password-she-will-remember');
await relative.getByLabel('Type it again').fill('a-password-she-will-remember');
await relative.getByRole('button', { name: 'Save it and take me in' }).click();
await relative.waitForURL('**/tree', { timeout: 15000 });
check('setting a new password signs her straight in', relative.url().includes('/tree'));

// The link is spent.
await relative.goto(resetUrl);
await relative.waitForTimeout(1200);
const spent = await relative.getByText(/already been used/).isVisible().catch(() => false);
check('and the link cannot be used a second time', spent);

// She can change it herself from now on.
await relative.goto(`${BASE}/account`);
await relative.waitForTimeout(1200);
await relative.getByLabel('Current password').fill('a-password-she-will-remember');
await relative.getByLabel('New password').fill('one-she-chose-herself');
await relative.getByLabel('Type it again').fill('one-she-chose-herself');
await relative.getByRole('button', { name: 'Change it' }).click();
await relative.waitForTimeout(1500);
const changed = await relative.getByText(/password has been changed/).isVisible().catch(() => false);
check('and she can change it herself afterwards', changed);
await relative.screenshot({ path: `${OUT}/54-account.png` });

// An ordinary member cannot reach the administrator's page.
await relative.goto(`${BASE}/members`);
await relative.waitForTimeout(1200);
check('an ordinary member cannot see the accounts page', !relative.url().includes('/members'), relative.url());

await browser.close();
const failed = results.filter(([, ok]) => !ok);
console.log(`\n${results.length - failed.length}/${results.length} recovery checks passed.`);
if (failed.length) process.exitCode = 1;
