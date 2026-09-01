import request from 'supertest';
import app from '../index';
import { db } from '../src/prisma/db';

describe('Applications CRUD', () => {
  beforeEach(async () => {
    // Note: Using Prisma 8 API for cleanup
    const allApps = await db.applications.all();
    for (const app of allApps) {
      await db.applications.delete({ id: app.id });
    }
    
    const allUsers = await db.users.all();
    for (const user of allUsers) {
      await db.users.delete({ id: user.id });
    }
  });

  it('prevents a user from updating another user\'s application', async () => {
    // User A signs up
    await request(app).post('/auth/signup').send({ email: 'a@test.com', password: 'pass123' });
    const loginA = await request(app)
      .post('/auth/login')
      .send({ email: 'a@test.com', password: 'pass123' });

    // User A creates an application
    const app1 = await request(app)
      .post('/applications')
      .set('Authorization', `Bearer ${loginA.body.token}`)
      .send({ company: 'Acme', role: 'SDET' });

    // User B signs up
    await request(app).post('/auth/signup').send({ email: 'b@test.com', password: 'pass123' });
    const loginB = await request(app)
      .post('/auth/login')
      .send({ email: 'b@test.com', password: 'pass123' });

    // User B tries to update User A's application
    const res = await request(app)
      .patch(`/applications/${app1.body.id}`)
      .set('Authorization', `Bearer ${loginB.body.token}`)
      .send({ status: 'Withdrawn' });

    // Should be forbidden
    expect(res.statusCode).toBe(403);

    // Verify the original status is unchanged
    const stillOriginal = await db.applications.byId(app1.body.id);
    expect(stillOriginal?.status).not.toBe('Withdrawn');
  });

  it('allows a user to create and list their own applications', async () => {
    // Sign up and login
    await request(app).post('/auth/signup').send({ email: 'test@test.com', password: 'pass123' });
    const login = await request(app)
      .post('/auth/login')
      .send({ email: 'test@test.com', password: 'pass123' });

    // Create an application
    const createRes = await request(app)
      .post('/applications')
      .set('Authorization', `Bearer ${login.body.token}`)
      .send({ company: 'TechCorp', role: 'Backend Engineer' });

    expect(createRes.statusCode).toBe(201);
    expect(createRes.body.company).toBe('TechCorp');

    // List applications
    const listRes = await request(app)
      .get('/applications')
      .set('Authorization', `Bearer ${login.body.token}`);

    expect(listRes.statusCode).toBe(200);
    expect(listRes.body.applications.length).toBe(1);
    expect(listRes.body.applications[0].company).toBe('TechCorp');
  });
});
