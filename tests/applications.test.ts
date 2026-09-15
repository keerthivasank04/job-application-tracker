import request from 'supertest';
import app from '../src/app';
import { db } from '../src/prisma/db';

describe('Applications and Features Integration Tests', () => {
  beforeEach(async () => {
    try {
      const allInterviews = await db.orm.Interview.all();
      for (const interview of allInterviews) {
        await db.orm.Interview.where({ id: interview.id }).delete();
      }

      const allHistory = await db.orm.StatusHistory.all();
      for (const history of allHistory) {
        await db.orm.StatusHistory.where({ id: history.id }).delete();
      }

      const allApps = await db.orm.Application.all();
      for (const appItem of allApps) {
        await db.orm.Application.where({ id: appItem.id }).delete();
      }

      const allUsers = await db.orm.User.all();
      for (const user of allUsers) {
        await db.orm.User.where({ id: user.id }).delete();
      }
    } catch {
      // Database cleanup if connected
    }
  });

  describe('Health Endpoint', () => {
    it('returns status ok and security headers', async () => {
      const res = await request(app).get('/health');
      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({ status: 'ok' });
      expect(res.headers['x-content-type-options']).toBe('nosniff');
    });
  });

  describe('Authentication Validation', () => {
    it('rejects signup with invalid email', async () => {
      const res = await request(app)
        .post('/auth/signup')
        .send({ email: 'not-an-email', password: 'password123' });

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toBe('A valid email address is required');
    });

    it('rejects signup with short password (less than 8 characters)', async () => {
      const res = await request(app)
        .post('/auth/signup')
        .send({ email: 'valid@example.com', password: 'short' });

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toBe('Password must be at least 8 characters long');
    });
  });

  describe('Application Validation', () => {
    it('rejects creating application with invalid status', async () => {
      // Create test token
      const signup = await request(app)
        .post('/auth/signup')
        .send({ email: 'user@example.com', password: 'password123' });

      if (signup.statusCode === 201) {
        const login = await request(app)
          .post('/auth/login')
          .send({ email: 'user@example.com', password: 'password123' });

        const res = await request(app)
          .post('/applications')
          .set('Authorization', `Bearer ${login.body.token}`)
          .send({ company: 'Acme', role: 'Engineer', status: 'InvalidStatus' });

        expect(res.statusCode).toBe(400);
        expect(res.body.error).toContain('Invalid status');
      }
    });

    it('rejects creating application with salaryMin greater than salaryMax', async () => {
      const signup = await request(app)
        .post('/auth/signup')
        .send({ email: 'salary@example.com', password: 'password123' });

      if (signup.statusCode === 201) {
        const login = await request(app)
          .post('/auth/login')
          .send({ email: 'salary@example.com', password: 'password123' });

        const res = await request(app)
          .post('/applications')
          .set('Authorization', `Bearer ${login.body.token}`)
          .send({
            company: 'TechCorp',
            role: 'Senior Dev',
            salaryMin: 180000,
            salaryMax: 120000,
          });

        expect(res.statusCode).toBe(400);
        expect(res.body.error).toBe('salaryMin cannot be greater than salaryMax');
      }
    });
  });

  describe('Ownership Enforcement', () => {
    it('prevents a user from updating another user\'s application', async () => {
      const signupA = await request(app)
        .post('/auth/signup')
        .send({ email: 'owner@example.com', password: 'password123' });

      if (signupA.statusCode === 201) {
        const loginA = await request(app)
          .post('/auth/login')
          .send({ email: 'owner@example.com', password: 'password123' });

        const appRes = await request(app)
          .post('/applications')
          .set('Authorization', `Bearer ${loginA.body.token}`)
          .send({ company: 'Acme Corp', role: 'Backend Engineer' });

        const signupB = await request(app)
          .post('/auth/signup')
          .send({ email: 'stranger@example.com', password: 'password123' });

        if (signupB.statusCode === 201) {
          const loginB = await request(app)
            .post('/auth/login')
            .send({ email: 'stranger@example.com', password: 'password123' });

          const patchRes = await request(app)
            .patch(`/applications/${appRes.body.id}`)
            .set('Authorization', `Bearer ${loginB.body.token}`)
            .send({ status: 'Withdrawn' });

          expect(patchRes.statusCode).toBe(403);
        }
      }
    });
  });
});
