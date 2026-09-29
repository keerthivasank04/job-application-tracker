/**
 * End-to-end browser test for the dashboard (Playwright + Chromium).
 *
 * Usage (server must be running, e.g. `npm run dev`):
 *   npm i --no-save playwright && npx playwright install chromium
 *   npm run test:e2e                # or: BASE_URL=http://localhost:3000 node tests/e2e/dashboard.e2e.mjs
 *
 * Creates a throw-away account, exercises every screen, then deletes the account.
 * Exits non-zero if any step fails or the page logs unexpected errors.
 */
import { chromium } from 'playwright';
import fs from 'fs';
import os from 'os';
import path from 'path';

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'jt-e2e-'));
const OUT = process.env.SCREENSHOT_DIR || path.join(TMP, 'screenshots');
const RESUME = path.join(TMP, 'resume.pdf');
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(RESUME, '%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');

const problems = [];
const log = (...a) => console.log('✔', ...a);
const email = `e2e+${Date.now()}@example.com`;

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
const page = await context.newPage();

// Responses that the test provokes on purpose (wrong password, bad token, …)
const EXPECTED = [/401 POST .*\/auth\/login$/, /400 POST .*\/auth\/change-password$/, /401 GET .*\/auth\/profile$/];
page.on('console', (m) => {
  if ((m.type() === 'error' || m.type() === 'warning') && !/Failed to load resource/.test(m.text())) problems.push(`console.${m.type()}: ${m.text()}`);
});
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
page.on('response', (r) => {
  const line = `${r.status()} ${r.request().method()} ${r.url()}`;
  if (r.status() >= 400 && !EXPECTED.some((re) => re.test(line))) problems.push(`HTTP ${line}`);
});

const expectVisible = async (sel, msg) => { await page.locator(sel).first().waitFor({ state: 'visible', timeout: 5000 }); if (msg) log(msg); };
const toastText = async (text) => { await page.locator('.toast', { hasText: text }).first().waitFor({ timeout: 5000 }); log(`toast: ${text}`); };
const cardCount = () => page.locator('#jobList .job-card').count();
const tabCount = (tab) => page.locator(`.status-tab[data-tab="${tab}"] .count`).textContent();
const openMenuItem = async (action) => { await page.click('#userMenuBtn'); await page.click(`#userMenu [data-action="${action}"]`); };
const step = async (name, fn) => {
  try { await fn(); } catch (e) { problems.push(`STEP FAILED [${name}]: ${e.message.split('\n')[0]}`); await page.screenshot({ path: `${OUT}/FAIL-${name}.png` }); }
};
const futureInput = (days, time) => {
  const d = new Date(Date.now() + days * 864e5);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${time}`;
};

await step('load', async () => {
  await page.goto(BASE);
  await expectVisible('#authView', 'auth screen shown');
  await page.screenshot({ path: `${OUT}/01-login.png` });
});

await step('validation', async () => {
  await page.click('#authSubmit');
  await expectVisible('#authError', 'client validation shows error');
  await page.fill('#authEmail', 'nobody@example.com');
  await page.fill('#authPassword', 'wrongpassword');
  await page.click('#authSubmit');
  await page.locator('#authError', { hasText: 'Invalid credentials' }).waitFor();
  log('bad credentials rejected');
});

await step('signup', async () => {
  await page.click('#tabSignup');
  await page.fill('#authName', 'Priya Sharma');
  await page.fill('#authEmail', email);
  await page.fill('#authPassword', 'Password123!');
  await page.click('#authSubmit');
  await expectVisible('#appView', 'app shell after signup');
  await expectVisible('#emptyState', 'empty state for new user');
  await page.locator('#healthBadge[data-state="ok"]').waitFor();
  log('health indicator ok');
});

async function createApp(data) {
  await page.click(data.fromEmpty ? '#emptyState [data-action="new-application"]' : '#newAppBtn');
  await expectVisible('#appDialog[open]');
  await page.fill('#appRole', data.role);
  await page.fill('#appCompany', data.company);
  if (data.location) await page.fill('#appLocation', data.location);
  if (data.min) await page.fill('#appSalaryMin', String(data.min));
  if (data.max) await page.fill('#appSalaryMax', String(data.max));
  if (data.currency) await page.selectOption('#appCurrency', data.currency);
  if (data.url) await page.fill('#appUrl', data.url);
  if (data.notes) await page.fill('#appNotes', data.notes);
  if (data.date) await page.fill('#appDate', data.date);
  await page.click('#appSubmit');
  await page.locator('#appDialog').waitFor({ state: 'hidden' });
  await page.locator(`.job-card:has-text("${data.company}")`).waitFor();
  await page.locator('#detailTitle', { hasText: data.role }).waitFor();
  log(`created ${data.company} and it is selected`);
}

await step('form-validation', async () => {
  await page.click('#emptyState [data-action="new-application"]');
  await page.fill('#appRole', 'Y');
  await page.fill('#appCompany', 'X');
  await page.fill('#appSalaryMin', '200');
  await page.fill('#appSalaryMax', '100');
  await page.click('#appSubmit');
  await page.locator('#appError', { hasText: 'Minimum pay' }).waitFor();
  log('pay range validation');
  await page.fill('#appSalaryMin', '');
  await page.fill('#appSalaryMax', '');
  await page.fill('#appUrl', 'not a url');
  await page.click('#appSubmit');
  await page.locator('#appError', { hasText: 'link' }).waitFor();
  log('url validation');
  await page.keyboard.press('Escape');
  await page.locator('#appDialog').waitFor({ state: 'hidden' });
});

await step('create', async () => {
  await createApp({ fromEmpty: true, company: 'Razorpay', role: 'Senior Backend Engineer', location: 'Bengaluru', min: 3500000, max: 4500000, currency: 'INR', url: 'https://razorpay.com/jobs/123', notes: 'Referred by Ankit.\nFocus on payments infra.' });
  await createApp({ company: 'Acme <script>alert(1)</script>', role: 'Platform Engineer', location: 'Remote', min: 150000, max: 180000, date: '2026-09-01' });
  await createApp({ company: 'Zeta', role: 'SDE II' });
  if ((await tabCount('all')).trim() !== '3') throw new Error('all-jobs count');
  log('tab counts updated');
  await page.screenshot({ path: `${OUT}/02-jobs.png` });
});

await step('detail-pane', async () => {
  await page.click('.job-card:has-text("Razorpay")');
  await page.locator('#detailTitle', { hasText: 'Senior Backend Engineer' }).waitFor();
  await page.locator('#detailSalary', { hasText: '₹' }).waitFor();
  log('INR pay formatted');
  await page.locator('#detailNotes', { hasText: 'Focus on payments infra.' }).waitFor();
  if (!(await page.locator('#detailApply').isVisible())) throw new Error('job posting button missing');
  if ((await page.getAttribute('#detailApply', 'href')) !== 'https://razorpay.com/jobs/123') throw new Error('job posting href');
  log('"View job posting" links to the posting');

  await page.selectOption('#detailStatus', 'Offered');
  await toastText('Moved to Offered');
  await page.locator('#detailHistory', { hasText: 'Offered' }).waitFor();
  log('activity shows the transition');

  await page.click('#addInterviewBtn');
  await expectVisible('#interviewDialog[open]');
  await page.fill('#intRound', 'System design');
  await page.fill('#intDate', futureInput(2, '15:30'));
  await page.fill('#intInterviewer', 'Rahul (EM)');
  await page.fill('#intLink', 'https://meet.google.com/abc-defg-hij');
  await page.fill('#intNotes', 'Prepare ledger design');
  await page.click('#intSubmit');
  await toastText('Interview round added');
  await page.locator('#detailInterviews .interview-item:has-text("System design")').waitFor();
  await page.locator('.job-card:has-text("Razorpay") .tag', { hasText: 'Interview' }).waitFor();
  log('interview shows in pane and as a tag on the card');

  await page.click('#detailInterviews [data-int-action="edit"]');
  await page.fill('#intRound', 'System design (onsite)');
  await page.click('#intSubmit');
  await toastText('Interview updated');
  await page.locator('#detailInterviews', { hasText: 'System design (onsite)' }).waitFor();

  await page.setInputFiles('#resumeInput', RESUME);
  await toastText('Resume uploaded');
  await page.locator('#detailResume .file-name', { hasText: 'resume.pdf' }).waitFor();
  await page.screenshot({ path: `${OUT}/03-detail.png` });

  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-resume="download"]')]);
  if (!fs.readFileSync(await dl.path(), 'utf8').startsWith('%PDF')) throw new Error('downloaded resume content mismatch');
  log(`resume downloaded as ${dl.suggestedFilename()}`);

  await page.click('[data-resume="delete"]');
  await page.click('#confirmOk');
  await toastText('Resume removed');
  await page.locator('#detailResume .dropzone').waitFor();

  await page.click('#detailInterviews [data-int-action="complete"]');
  await toastText('marked as completed');
});

await step('xss', async () => {
  const txt = await page.locator('.job-card:has-text("Acme") .job-company').textContent();
  if (!txt.includes('<script>')) throw new Error('company text not rendered literally');
  log('HTML in company name is escaped');
});

await step('edit', async () => {
  await page.click('.job-card:has-text("Zeta")');
  await page.click('#detailEdit');
  await page.fill('#appRole', 'SDE III');
  await page.selectOption('#appStatus', 'Rejected');
  await expectVisible('#statusNoteField', 'status note appears on status change');
  await page.fill('#appStatusNote', 'Position filled');
  await page.click('#appSubmit');
  await toastText('Job updated');
  await page.locator('#detailTitle', { hasText: 'SDE III' }).waitFor();
  await page.locator('#detailHistory', { hasText: 'Position filled' }).waitFor();
});

await step('search-filters', async () => {
  await page.fill('#searchWhat', 'razor');
  await page.waitForTimeout(300);
  if ((await cardCount()) !== 1) throw new Error('what search');
  log('"what" search');
  await page.fill('#searchWhat', '');
  await page.fill('#searchWhere', 'remote');
  await page.click('#searchForm button[type="submit"]');
  await page.waitForTimeout(200);
  if ((await cardCount()) !== 1) throw new Error('where search');
  log('"where" search');
  await page.fill('#searchWhere', '');
  await page.selectOption('#filterPay', 'with');
  await page.waitForTimeout(100);
  if ((await cardCount()) !== 2) throw new Error('pay filter');
  await expectVisible('#clearFilters', 'pay filter + clear link');
  await page.click('#clearFilters');
  await page.waitForTimeout(100);
  if ((await cardCount()) !== 3) throw new Error('clear filters');
  await page.click('.status-tab[data-tab="archived"]');
  await page.waitForTimeout(100);
  if ((await cardCount()) !== 1) throw new Error('archived tab');
  log('status tabs');
  await page.click('.status-tab[data-tab="all"]');
  await page.click('.sort-link[data-sort="company"]');
  const first = await page.locator('.job-card').first().textContent();
  if (!first.includes('Acme')) throw new Error('sort by company');
  log('sort links');
  await page.click('.sort-link[data-sort="recent"]');
  await page.fill('#searchWhat', 'zzz-no-match');
  await page.waitForTimeout(300);
  await expectVisible('.job-list-empty', 'no-results state');
  await page.click('.job-list-empty [data-action="clear-filters"]');
  await page.waitForTimeout(100);
});

await step('pipeline', async () => {
  await page.click('.nav-link[data-view="pipeline"]');
  await expectVisible('#pipelineView');
  const card = page.locator('.board-card:has-text("Acme")');
  await card.dragTo(page.locator('.column[data-status="Withdrawn"]'));
  await toastText('Moved to Withdrawn');
  await page.locator('.column[data-status="Withdrawn"] .board-card:has-text("Acme")').waitFor();
  log('drag and drop changes status');
  await page.screenshot({ path: `${OUT}/04-pipeline.png` });
  await page.click('.board-card:has-text("Razorpay")');
  await expectVisible('#jobsView');
  await page.locator('#detailTitle', { hasText: 'Senior Backend Engineer' }).waitFor();
  log('clicking a pipeline card opens it in My jobs');
});

await step('delete-app', async () => {
  await page.click('.job-card:has-text("Zeta")');
  await page.click('#detailDelete');
  await expectVisible('#confirmDialog[open]');
  await page.click('#confirmOk');
  await toastText('Job deleted');
  await page.waitForTimeout(200);
  if ((await tabCount('all')).trim() !== '2') throw new Error('count after delete');
});

await step('interviews-view', async () => {
  await page.click('.job-card:has-text("Acme")');
  await page.selectOption('#detailStatus', 'Applied');
  await toastText('Moved to Applied');
  await page.click('#addInterviewBtn');
  await page.fill('#intRound', 'Recruiter screen');
  await page.fill('#intDate', futureInput(1, '10:00'));
  await page.click('#intSubmit');
  await toastText('Interview round added');
  await page.locator('#detailStatus').evaluate((s) => s.value).then((v) => { if (v !== 'Interviewing') throw new Error('auto status'); });
  log('adding first round moves Applied → Interviewing');
  await page.click('.nav-link[data-view="interviews"]');
  await page.locator('#upcomingList .interview-item:has-text("Recruiter screen")').waitFor();
  await page.locator('#pastList .interview-item:has-text("System design")').waitFor();
  await page.locator('#interviewBadge', { hasText: '1' }).waitFor();
  log('interviews view: upcoming + past, nav badge');
  await page.screenshot({ path: `${OUT}/05-interviews.png` });
  await page.click('#upcomingList [data-open-app]');
  await page.locator('#detailTitle', { hasText: 'Platform Engineer' }).waitFor();
  log('interview link opens the job');
});

await step('export', async () => {
  await page.click('#userMenuBtn');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#userMenu [data-action="export"]')]);
  const csv = fs.readFileSync(await dl.path(), 'utf8');
  if (!csv.startsWith('id,company,role') || !csv.includes('Razorpay')) throw new Error('csv content');
  log(`CSV exported (${dl.suggestedFilename()})`);
});

await step('profile', async () => {
  await openMenuItem('open-profile');
  await expectVisible('#profileDialog[open]');
  await page.fill('#profileName', 'Priya S.');
  await page.fill('#profileLinkedin', 'https://linkedin.com/in/priya');
  await page.click('#profileForm button[type="submit"]');
  await toastText('Profile saved');
  await page.fill('#pwCurrent', 'wrong-password');
  await page.fill('#pwNew', 'NewPassword456!');
  await page.click('#passwordForm button[type="submit"]');
  await page.locator('#passwordError', { hasText: 'incorrect' }).waitFor();
  log('wrong current password rejected');
  await page.fill('#pwCurrent', 'Password123!');
  await page.click('#passwordForm button[type="submit"]');
  await toastText('Password updated');
  await page.keyboard.press('Escape');
  await page.click('#userMenuBtn');
  await page.locator('#userName', { hasText: 'Priya S.' }).waitFor();
  await page.keyboard.press('Escape');
});

await step('logout-login', async () => {
  await openMenuItem('logout');
  await expectVisible('#authView', 'signed out');
  await page.fill('#authEmail', email);
  await page.fill('#authPassword', 'NewPassword456!');
  await page.click('#authSubmit');
  await expectVisible('#appView', 'signed in with new password');
  await page.reload();
  await expectVisible('#appView', 'session persists across reload');
});

await step('expired-token', async () => {
  await page.evaluate(() => localStorage.setItem('jt.token', 'garbage'));
  await page.reload();
  await expectVisible('#authView', 'invalid token → auth screen');
});

await step('forgot', async () => {
  await page.click('#forgotLink');
  await page.fill('#forgotEmail', email);
  await page.click('#forgotForm button[type="submit"]');
  await expectVisible('#resetForm');
  if ((await page.inputValue('#resetToken')).length < 32) throw new Error('dev token not filled');
  await page.fill('#resetPassword', 'ResetPassword789!');
  await page.click('#resetForm button[type="submit"]');
  await toastText('Password updated');
  await page.fill('#authPassword', 'ResetPassword789!');
  await page.click('#authSubmit');
  await expectVisible('#appView', 'login after reset');
});

await step('dark-mobile', async () => {
  await page.click('#userMenuBtn');
  await page.click('#themeToggle');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/06-dark.png` });
  await page.click('#userMenuBtn');
  await page.click('#themeToggle');
  await page.keyboard.press('Escape');

  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, storageState: await context.storageState() });
  const m = await mobile.newPage();
  m.on('pageerror', (e) => problems.push(`mobile pageerror: ${e.message}`));
  await m.goto(`${BASE}/#jobs`);
  await m.locator('.job-card').first().waitFor();
  const overflow = await m.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth || innerWidth > 390);
  if (overflow) throw new Error('horizontal page overflow on mobile');
  log('no horizontal overflow on mobile');
  if (await m.locator('#detailPane').isVisible()) throw new Error('detail pane should be hidden on mobile until a job is tapped');
  await m.locator('.job-card').first().tap();
  await m.locator('#detailPane.is-open').waitFor();
  const paneOverflow = await m.evaluate(() => document.querySelector('.dp-body').scrollWidth > document.querySelector('.dp-body').clientWidth);
  if (paneOverflow) throw new Error('detail sheet overflows horizontally');
  await m.waitForTimeout(400);
  await m.screenshot({ path: `${OUT}/07-mobile-detail.png` });
  await m.locator('#detailBack').tap();
  await m.locator('#detailPane.is-open').waitFor({ state: 'detached' });
  log('mobile: tapping a job opens a full-screen sheet, Back closes it');
  await mobile.close();
});

await step('api-docs', async () => {
  const docs = await context.newPage();
  const errs = [];
  docs.on('pageerror', (e) => errs.push(e.message));
  docs.on('console', (msg) => msg.type() === 'error' && errs.push(msg.text()));
  await docs.goto(`${BASE}/api-docs/`);
  await docs.locator('.swagger-ui .info').waitFor({ timeout: 8000 });
  if (errs.length) throw new Error('swagger errors: ' + errs.join(' | '));
  log('Swagger UI renders under CSP');
  await docs.close();
});

await step('delete-account', async () => {
  await openMenuItem('open-profile');
  await page.click('#deleteAccountBtn');
  await expectVisible('#confirmDialog[open]');
  if (!(await page.locator('#confirmOk').isDisabled())) throw new Error('confirm should be disabled');
  await page.fill('#confirmInput', 'DELETE');
  await page.click('#confirmOk');
  await toastText('account has been deleted');
  await expectVisible('#authView');
});

await browser.close();
console.log(`\nScreenshots: ${OUT}`);
console.log('\n==== Problems ====');
console.log(problems.length ? problems.join('\n') : 'none');
process.exit(problems.length ? 1 : 0);
