/**
 * Integration tests against a real PostgreSQL database (DATABASE_URL).
 * Every test creates its own users, and cleans them up afterwards.
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { api, createUser, deleteUser } from './helpers';
import { db } from '../src/prisma/db';

type User = Awaited<ReturnType<typeof createUser>>;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

describe('API integration', () => {
  let alice: User;
  let bob: User;

  before(async () => {
    alice = await createUser('alice');
    bob = await createUser('bob');
  });

  after(async () => {
    await deleteUser(alice.auth);
    await deleteUser(bob.auth);
    await db.close?.();
  });

  describe('health', () => {
    it('reports a connected database', async () => {
      const res = await api().get('/health');
      assert.equal(res.status, 200);
      assert.equal(res.body.database, 'connected');
    });
  });

  describe('auth', () => {
    it('validates signup input', async () => {
      assert.equal((await api().post('/auth/signup').send({ email: 'nope', password: 'password123' })).status, 400);
      const short = await api().post('/auth/signup').send({ email: 'x@y.dev', password: 'short' });
      assert.equal(short.status, 400);
      assert.equal(short.body.error, 'Password must be at least 8 characters long');
    });

    it('rejects duplicate emails with 409', async () => {
      const res = await api().post('/auth/signup').send({ email: alice.email.toUpperCase(), password: 'password123' });
      assert.equal(res.status, 409);
    });

    it('rejects wrong passwords', async () => {
      const res = await api().post('/auth/login').send({ email: alice.email, password: 'wrong-password' });
      assert.equal(res.status, 401);
    });

    it('returns a profile without sensitive fields', async () => {
      const res = await api().get('/auth/profile').set(alice.auth);
      assert.equal(res.status, 200);
      assert.equal(res.body.email, alice.email);
      assert.equal(res.body.name, 'Test User');
      assert.equal(res.body.passwordHash, undefined);
      assert.equal(res.body.resetPasswordToken, undefined);
      assert.match(res.body.createdAt, ISO);
    });

    it('updates and clears profile fields, validating URLs', async () => {
      const bad = await api().patch('/auth/profile').set(alice.auth).send({ linkedinUrl: 'javascript:alert(1)' });
      assert.equal(bad.status, 400);

      const ok = await api().patch('/auth/profile').set(alice.auth).send({ name: 'Alice', githubUrl: 'https://github.com/alice' });
      assert.equal(ok.status, 200);
      assert.equal(ok.body.name, 'Alice');
      assert.equal(ok.body.githubUrl, 'https://github.com/alice');

      const cleared = await api().patch('/auth/profile').set(alice.auth).send({ githubUrl: null });
      assert.equal(cleared.body.githubUrl, null);
    });

    it('changes the password', async () => {
      const user = await createUser('pw');
      const wrong = await api().post('/auth/change-password').set(user.auth).send({ currentPassword: 'nope', newPassword: 'newpassword1' });
      assert.equal(wrong.status, 400);
      const ok = await api().post('/auth/change-password').set(user.auth).send({ currentPassword: user.password, newPassword: 'newpassword1' });
      assert.equal(ok.status, 200);
      assert.equal((await api().post('/auth/login').send({ email: user.email, password: 'newpassword1' })).status, 200);
      await deleteUser(user.auth);
    });

    it('resets a forgotten password with a one-time token', async () => {
      const user = await createUser('reset');
      const forgot = await api().post('/auth/forgot-password').send({ email: user.email });
      assert.equal(forgot.status, 200);
      assert.ok(forgot.body.devResetToken, 'dev token returned outside production');

      const unknown = await api().post('/auth/forgot-password').send({ email: 'nobody@nowhere.dev' });
      assert.equal(unknown.status, 200);
      assert.equal(unknown.body.devResetToken, undefined);

      const bad = await api().post('/auth/reset-password').send({ token: 'bad', newPassword: 'resetpass1' });
      assert.equal(bad.status, 400);

      const ok = await api().post('/auth/reset-password').send({ token: forgot.body.devResetToken, newPassword: 'resetpass1' });
      assert.equal(ok.status, 200);
      const reuse = await api().post('/auth/reset-password').send({ token: forgot.body.devResetToken, newPassword: 'resetpass2' });
      assert.equal(reuse.status, 400, 'token cannot be reused');
      assert.equal((await api().post('/auth/login').send({ email: user.email, password: 'resetpass1' })).status, 200);
      await deleteUser(user.auth);
    });

    it('rejects expired reset tokens', async () => {
      const user = await createUser('expired');
      const forgot = await api().post('/auth/forgot-password').send({ email: user.email });
      const u = await db.orm.public.User.where({ email: user.email }).first();
      await db.orm.public.User.where({ id: u.id }).update({ resetPasswordExpires: new Date(Date.now() - 60_000).toISOString() });
      const res = await api().post('/auth/reset-password').send({ token: forgot.body.devResetToken, newPassword: 'resetpass1' });
      assert.equal(res.status, 400);
      await deleteUser(user.auth);
    });
  });

  describe('applications', () => {
    let appId: number;

    it('validates input', async () => {
      const cases = [
        [{ role: 'Engineer' }, /Company/],
        [{ company: 'Acme', role: 'Engineer', status: 'InvalidStatus' }, /Invalid status/],
        [{ company: 'Acme', role: 'Engineer', salaryMin: 180000, salaryMax: 120000 }, /salaryMin cannot be greater/],
        [{ company: 'Acme', role: 'Engineer', salaryMin: -1 }, /salaryMin/],
        [{ company: 'Acme', role: 'Engineer', currency: 'DOLLARS' }, /currency/],
        [{ company: 'Acme', role: 'Engineer', jobPostUrl: 'ftp://x' }, /jobPostUrl/],
      ] as const;
      for (const [body, msg] of cases) {
        const res = await api().post('/applications').set(alice.auth).send(body);
        assert.equal(res.status, 400, JSON.stringify(body));
        assert.match(res.body.error, msg);
      }
    });

    it('creates an application with ISO timestamps and no internal paths', async () => {
      const res = await api().post('/applications').set(alice.auth).send({
        company: '  Acme Corp ', role: 'Backend Engineer', salaryMin: 100000, salaryMax: 150000,
        currency: 'inr', jobLocation: 'Remote', jobPostUrl: 'https://acme.dev/jobs/1', notes: 'Referral',
        appliedDate: '2026-09-01T12:00:00.000Z',
      });
      assert.equal(res.status, 201);
      assert.equal(res.body.company, 'Acme Corp');
      assert.equal(res.body.status, 'Applied');
      assert.equal(res.body.currency, 'INR');
      assert.equal(res.body.appliedDate, '2026-09-01T12:00:00.000Z');
      assert.ok(!('resumePath' in res.body));
      appId = res.body.id;
    });

    it('paginates with a cursor and filters by company and status', async () => {
      for (const company of ['Beta Inc', 'Gamma LLC', 'Delta 100%']) {
        await api().post('/applications').set(alice.auth).send({ company, role: 'Engineer', status: 'Interviewing' });
      }
      const page1 = await api().get('/applications?limit=2').set(alice.auth);
      assert.equal(page1.body.applications.length, 2);
      assert.ok(page1.body.nextCursor);
      const page2 = await api().get(`/applications?limit=2&cursor=${page1.body.nextCursor}`).set(alice.auth);
      assert.equal(page2.body.applications.length, 2);
      assert.equal(page2.body.nextCursor, null, 'no phantom next page');
      const ids = [...page1.body.applications, ...page2.body.applications].map((a: any) => a.id);
      assert.equal(new Set(ids).size, 4);

      const search = await api().get('/applications?company=gAmMa').set(alice.auth);
      assert.deepEqual(search.body.applications.map((a: any) => a.company), ['Gamma LLC']);
      const literal = await api().get('/applications?company=%25').set(alice.auth);
      assert.deepEqual(literal.body.applications.map((a: any) => a.company), ['Delta 100%'], '% is matched literally');

      const byStatus = await api().get('/applications?status=Interviewing').set(alice.auth);
      assert.equal(byStatus.body.applications.length, 3);
      assert.equal((await api().get('/applications?status=Bogus').set(alice.auth)).status, 400);
    });

    it('computes stats', async () => {
      const res = await api().get('/applications/stats').set(alice.auth);
      assert.equal(res.body.totalApplications, 4);
      assert.equal(res.body.byStatus.Interviewing, 3);
      assert.equal(res.body.interviewRate, '75%');
    });

    it('updates fields, clears optional ones and records status history', async () => {
      const res = await api().patch(`/applications/${appId}`).set(alice.auth)
        .send({ status: 'Interviewing', statusNote: 'Recruiter reached out', jobLocation: null, salaryMin: null });
      assert.equal(res.status, 200);
      assert.equal(res.body.status, 'Interviewing');
      assert.equal(res.body.jobLocation, null);
      assert.equal(res.body.salaryMin, null);

      const history = await api().get(`/applications/${appId}/history`).set(alice.auth);
      assert.equal(history.body.length, 1);
      assert.equal(history.body[0].fromStatus, 'Applied');
      assert.equal(history.body[0].toStatus, 'Interviewing');
      assert.equal(history.body[0].notes, 'Recruiter reached out');
      assert.match(history.body[0].changedAt, ISO);
    });

    it('validates the salary range against stored values on update', async () => {
      const res = await api().patch(`/applications/${appId}`).set(alice.auth).send({ salaryMin: 999999 });
      assert.equal(res.status, 400);
    });

    it('enforces ownership', async () => {
      assert.equal((await api().get(`/applications/${appId}`).set(bob.auth)).status, 403);
      assert.equal((await api().patch(`/applications/${appId}`).set(bob.auth).send({ status: 'Withdrawn' })).status, 403);
      assert.equal((await api().delete(`/applications/${appId}`).set(bob.auth)).status, 403);
      assert.equal((await api().get(`/applications/${appId}/history`).set(bob.auth)).status, 403);
      assert.equal((await api().get('/applications/999999').set(alice.auth)).status, 404);
      assert.equal((await api().get('/applications/abc').set(alice.auth)).status, 400);
    });

    it('exports CSV with proper escaping', async () => {
      await api().post('/applications').set(alice.auth).send({ company: 'Comma, "Quoted"', role: '=SUM(A1)' });
      const res = await api().get('/export/csv').set(alice.auth);
      assert.equal(res.status, 200);
      assert.match(res.headers['content-type'], /text\/csv/);
      assert.match(res.headers['content-disposition'], /attachment; filename="applications-/);
      assert.match(res.text, /^id,company,role,status/);
      assert.match(res.text, /"Comma, ""Quoted"""/);
      assert.match(res.text, /"'=SUM\(A1\)"/, 'formula injection neutralised');
    });
  });

  describe('interviews', () => {
    let appId: number;
    let interviewId: number;

    before(async () => {
      const res = await api().post('/applications').set(alice.auth).send({ company: 'InterviewCo', role: 'Engineer' });
      appId = res.body.id;
    });

    it('validates input', async () => {
      assert.equal((await api().post(`/applications/${appId}/interviews`).set(alice.auth).send({ roundName: 'x' })).status, 400);
      assert.equal((await api().post(`/applications/${appId}/interviews`).set(alice.auth).send({ roundName: 'x', scheduledDate: 'nope' })).status, 400);
      assert.equal((await api().post(`/applications/${appId}/interviews`).set(alice.auth).send({ roundName: 'x', scheduledDate: new Date().toISOString(), status: 'Maybe' })).status, 400);
    });

    it('creates, lists, updates and deletes interview rounds', async () => {
      const when = new Date(Date.now() + 2 * 864e5).toISOString();
      const created = await api().post(`/applications/${appId}/interviews`).set(alice.auth)
        .send({ roundName: 'Phone screen', scheduledDate: when, meetingLink: 'https://meet.example.com/x' });
      assert.equal(created.status, 201);
      assert.equal(created.body.scheduledDate, when);
      interviewId = created.body.id;

      const list = await api().get(`/applications/${appId}/interviews`).set(alice.auth);
      assert.equal(list.body.length, 1);

      const upcoming = await api().get('/interviews?upcoming=true').set(alice.auth);
      assert.ok(upcoming.body.some((i: any) => i.id === interviewId && i.company === 'InterviewCo'));

      const updated = await api().patch(`/interviews/${interviewId}`).set(alice.auth).send({ status: 'Completed', feedbackNotes: 'Went well' });
      assert.equal(updated.status, 200);
      assert.equal(updated.body.status, 'Completed');

      const notUpcoming = await api().get('/interviews?upcoming=true').set(alice.auth);
      assert.ok(!notUpcoming.body.some((i: any) => i.id === interviewId));

      assert.equal((await api().get(`/interviews/${interviewId}`).set(bob.auth)).status, 403);
      assert.equal((await api().delete(`/interviews/${interviewId}`).set(alice.auth)).status, 204);
      assert.equal((await api().get(`/interviews/${interviewId}`).set(alice.auth)).status, 404);
    });

    it('deletes an application together with its interviews and history', async () => {
      await api().post(`/applications/${appId}/interviews`).set(alice.auth).send({ roundName: 'Onsite', scheduledDate: new Date().toISOString() });
      await api().patch(`/applications/${appId}`).set(alice.auth).send({ status: 'Rejected' });
      const res = await api().delete(`/applications/${appId}`).set(alice.auth);
      assert.equal(res.status, 204);
      assert.equal((await api().get(`/applications/${appId}`).set(alice.auth)).status, 404);
      const orphans = await db.orm.public.Interview.where({ applicationId: appId }).all();
      assert.equal(orphans.length, 0);
    });
  });

  describe('resumes', () => {
    let appId: number;

    before(async () => {
      const res = await api().post('/applications').set(alice.auth).send({ company: 'ResumeCo', role: 'Engineer' });
      appId = res.body.id;
    });

    it('rejects disallowed file types', async () => {
      const res = await api().post(`/applications/${appId}/resume`).set(alice.auth)
        .attach('resume', Buffer.from('hello'), { filename: 'evil.exe', contentType: 'application/octet-stream' });
      assert.equal(res.status, 400);
    });

    it('uploads, downloads and deletes a resume', async () => {
      const pdf = Buffer.from('%PDF-1.4\n%%EOF\n');
      const up = await api().post(`/applications/${appId}/resume`).set(alice.auth)
        .attach('resume', pdf, { filename: 'cv.pdf', contentType: 'application/pdf' });
      assert.equal(up.status, 200);
      assert.equal(up.body.resumeOriginalName, 'cv.pdf');
      assert.ok(!('resumePath' in up.body));

      assert.equal((await api().get(`/applications/${appId}/resume`).set(bob.auth)).status, 403);
      const down = await api().get(`/applications/${appId}/resume`).set(alice.auth).buffer(true);
      assert.equal(down.status, 200);
      assert.match(down.headers['content-disposition'], /cv\.pdf/);

      const del = await api().delete(`/applications/${appId}/resume`).set(alice.auth);
      assert.equal(del.status, 200);
      assert.equal(del.body.resumeOriginalName, null);
      assert.equal((await api().get(`/applications/${appId}/resume`).set(alice.auth)).status, 404);
    });
  });

  describe('admin', () => {
    it('is restricted to ADMIN_EMAILS', async () => {
      const denied = await api().get('/admin/stats').set(bob.auth);
      assert.equal(denied.status, 403);

      process.env.ADMIN_EMAILS = alice.email;
      const allowed = await api().get('/admin/stats').set(alice.auth);
      delete process.env.ADMIN_EMAILS;
      assert.equal(allowed.status, 200);
      assert.ok(Array.isArray(allowed.body));
    });
  });

  describe('account deletion', () => {
    it('removes the user and all of their data', async () => {
      const user = await createUser('gone');
      const app = await api().post('/applications').set(user.auth).send({ company: 'Temp', role: 'Engineer' });
      await api().post(`/applications/${app.body.id}/interviews`).set(user.auth).send({ roundName: 'x', scheduledDate: new Date().toISOString() });
      await api().patch(`/applications/${app.body.id}`).set(user.auth).send({ status: 'Withdrawn' });

      assert.equal((await api().delete('/auth/profile').set(user.auth)).status, 204);
      assert.equal((await api().post('/auth/login').send({ email: user.email, password: user.password })).status, 401);
      assert.equal((await db.orm.public.Application.where({ id: app.body.id }).all()).length, 0);
    });
  });
});
