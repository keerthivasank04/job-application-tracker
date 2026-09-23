import request from 'supertest';
import app from '../src/app';

describe('Global Middleware and Routing Tests', () => {
  describe('Not Found (404) Handler', () => {
    it('returns structured 404 JSON for undefined routes', async () => {
      const res = await request(app).get('/undefined-path-for-testing');
      expect(res.statusCode).toBe(404);
      expect(res.body).toHaveProperty('error');
      expect(res.body.error).toContain('/undefined-path-for-testing');
      expect(res.body.statusCode).toBe(404);
    });
  });

  describe('Malformed JSON Handler', () => {
    it('returns structured 400 when receiving invalid JSON', async () => {
      const res = await request(app)
        .post('/auth/login')
        .set('Content-Type', 'application/json')
        .send('{ invalid-json-syntax }');

      expect(res.statusCode).toBe(400);
      expect(res.body).toHaveProperty('error');
    });
  });

  describe('Authentication Guards on New Endpoints', () => {
    it('rejects unauthenticated requests to /applications/stats', async () => {
      const res = await request(app).get('/applications/stats');
      expect(res.statusCode).toBe(401);
      expect(res.body.error).toBe('No token provided');
    });

    it('rejects unauthenticated requests to /applications/:id/resume', async () => {
      const res = await request(app).get('/applications/1/resume');
      expect(res.statusCode).toBe(401);
      expect(res.body.error).toBe('No token provided');
    });

    it('rejects unauthenticated requests to /applications/:id/interviews', async () => {
      const res = await request(app).get('/applications/1/interviews');
      expect(res.statusCode).toBe(401);
      expect(res.body.error).toBe('No token provided');
    });

    it('rejects unauthenticated requests to /interviews/:id', async () => {
      const res = await request(app).get('/interviews/1');
      expect(res.statusCode).toBe(401);
      expect(res.body.error).toBe('No token provided');
    });

    it('rejects unauthenticated requests to /auth/profile', async () => {
      const res = await request(app).get('/auth/profile');
      expect(res.statusCode).toBe(401);
      expect(res.body.error).toBe('No token provided');
    });
  });
});
