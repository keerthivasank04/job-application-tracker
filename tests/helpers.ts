import request from 'supertest';
import app from '../src/app';

export const api = () => request(app);

let counter = 0;

/** Create a fresh user and return an auth header for it. */
export async function createUser(prefix = 'user') {
  const email = `${prefix}.${Date.now()}.${process.pid}.${counter++}@test.dev`;
  const password = 'password123';
  const signup = await api().post('/auth/signup').send({ email, password, name: 'Test User' });
  if (signup.status !== 201) throw new Error(`signup failed: ${signup.status} ${JSON.stringify(signup.body)}`);
  const login = await api().post('/auth/login').send({ email, password });
  const token = login.body.token as string;
  return { email, password, token, auth: { Authorization: `Bearer ${token}` } };
}

export async function deleteUser(auth: Record<string, string>) {
  await api().delete('/auth/profile').set(auth);
}
