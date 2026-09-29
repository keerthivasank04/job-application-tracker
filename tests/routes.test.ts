import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { api } from './helpers';

describe('Global middleware and routing', () => {
  it('returns structured 404 JSON for undefined routes', async () => {
    const res = await api().get('/undefined-path-for-testing');
    assert.equal(res.status, 404);
    assert.match(res.body.error, /undefined-path-for-testing/);
    assert.equal(res.body.statusCode, 404);
  });

  it('returns 400 for malformed JSON bodies', async () => {
    const res = await api().post('/auth/login').set('Content-Type', 'application/json').send('{ invalid-json }');
    assert.equal(res.status, 400);
    assert.ok(res.body.error);
  });

  it('serves the frontend with security headers', async () => {
    const res = await api().get('/');
    assert.equal(res.status, 200);
    assert.match(res.text, /<title>Job Tracker<\/title>/);
    assert.equal(res.headers['x-content-type-options'], 'nosniff');
    assert.match(res.headers['content-security-policy'], /script-src 'self'/);
  });

  for (const path of ['/applications', '/applications/stats', '/applications/1/resume', '/applications/1/interviews', '/interviews', '/interviews/1', '/auth/profile', '/export/csv', '/admin/stats']) {
    it(`rejects unauthenticated GET ${path}`, async () => {
      const res = await api().get(path);
      assert.equal(res.status, 401);
      assert.equal(res.body.error, 'No token provided');
    });
  }

  it('rejects an invalid token', async () => {
    const res = await api().get('/auth/profile').set('Authorization', 'Bearer not-a-token');
    assert.equal(res.status, 401);
  });
});
