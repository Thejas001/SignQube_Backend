'use strict';

/**
 * Auth over HTTP, and the role guards: each role can sign in, and each role is
 * blocked from the other areas.
 */

const api = require('../helpers/api');
const db = require('../helpers/db');
const authService = require('../../src/services/authService');

const { prisma } = db;

const REFRESH_COOKIE = 'signque_refresh';

function cookieFrom(res) {
  const header = res.headers['set-cookie'] || [];
  const cookie = header.find((c) => c.startsWith(`${REFRESH_COOKIE}=`));
  return cookie ? cookie.split(';')[0] : null;
}

beforeEach(async () => {
  await db.resetDatabase();
});

afterAll(async () => {
  await db.disconnect();
});

describe('register', () => {
  it('creates a CUSTOMER and returns an access token', async () => {
    const res = await api
      .api()
      .post('/api/auth/register')
      .send({ name: 'Kiran', email: 'Kiran@Test.Local', phone: '+91 90000 11111', password: 'Customer@123' })
      .expect(201);

    expect(res.body.data.user).toMatchObject({ email: 'kiran@test.local', role: 'CUSTOMER' });
    expect(res.body.data.accessToken).toBeTruthy();
    expect(res.body.data.user.passwordHash).toBeUndefined();
    expect(cookieFrom(res)).toBeTruthy();

    // The refresh token is stored hashed, never in the clear.
    const stored = await prisma.refreshToken.findFirst();
    expect(stored.tokenHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('ignores a role sent in the body', async () => {
    const res = await api
      .api()
      .post('/api/auth/register')
      .send({ name: 'Sneaky', email: 'sneaky@test.local', password: 'Customer@123', role: 'ADMIN' })
      .expect(201);
    expect(res.body.data.user.role).toBe('CUSTOMER');
  });

  it('refuses a duplicate email', async () => {
    await db.createUser({ email: 'taken@test.local' });
    const res = await api
      .api()
      .post('/api/auth/register')
      .send({ name: 'Second', email: 'taken@test.local', password: 'Customer@123' })
      .expect(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });

  it('refuses a short password and a bad email', async () => {
    await api
      .api()
      .post('/api/auth/register')
      .send({ name: 'Short', email: 'short@test.local', password: 'abc' })
      .expect(422);

    await api
      .api()
      .post('/api/auth/register')
      .send({ name: 'Bad', email: 'not-an-email', password: 'Customer@123' })
      .expect(422);
  });

  it('never stores the password in the clear', async () => {
    await api
      .api()
      .post('/api/auth/register')
      .send({ name: 'Kiran', email: 'hash@test.local', password: 'Customer@123' })
      .expect(201);

    const user = await prisma.user.findUnique({ where: { email: 'hash@test.local' } });
    expect(user.passwordHash).not.toContain('Customer@123');
    // bcrypt cost 12.
    expect(user.passwordHash).toMatch(/^\$2[aby]\$12\$/);
  });
});

describe('login', () => {
  it('signs in each seeded role', async () => {
    for (const role of ['CUSTOMER', 'ADMIN', 'DESIGNER', 'PRINTER']) {
      const user = await db.createUser({ role, email: `${role.toLowerCase()}@login.local` });
      const res = await api
        .api()
        .post('/api/auth/login')
        .send({ email: user.email, password: db.PASSWORD })
        .expect(200);
      expect(res.body.data.user.role).toBe(role);
      expect(res.body.data.accessToken).toBeTruthy();
    }
  });

  it('gives the same message for a wrong password and an unknown email', async () => {
    const user = await db.createUser({ email: 'real@test.local' });

    const wrongPassword = await api
      .api()
      .post('/api/auth/login')
      .send({ email: user.email, password: 'Wrong@12345' })
      .expect(401);

    const unknownEmail = await api
      .api()
      .post('/api/auth/login')
      .send({ email: 'nobody@test.local', password: db.PASSWORD })
      .expect(401);

    expect(wrongPassword.body.message).toBe(unknownEmail.body.message);
  });

  it('refuses a deactivated account', async () => {
    const user = await db.createUser({ email: 'gone@test.local', isActive: false });
    const res = await api
      .api()
      .post('/api/auth/login')
      .send({ email: user.email, password: db.PASSWORD })
      .expect(403);
    expect(res.body.message).toMatch(/deactivated/);
  });
});

describe('refresh and rotation', () => {
  it('rotates the token and revokes the old one', async () => {
    const user = await db.createUser({ email: 'rotate@test.local' });
    const login = await api
      .api()
      .post('/api/auth/login')
      .send({ email: user.email, password: db.PASSWORD })
      .expect(200);

    const firstCookie = cookieFrom(login);

    const refreshed = await api
      .api()
      .post('/api/auth/refresh')
      .set('Cookie', firstCookie)
      .expect(200);

    expect(refreshed.body.data.accessToken).toBeTruthy();
    const secondCookie = cookieFrom(refreshed);
    expect(secondCookie).not.toBe(firstCookie);

    // The old token is revoked, and reusing it revokes everything.
    await api.api().post('/api/auth/refresh').set('Cookie', firstCookie).expect(401);

    const tokens = await prisma.refreshToken.findMany({ where: { userId: user.id } });
    expect(tokens.every((t) => t.revokedAt !== null)).toBe(true);

    // Which means the rotated one no longer works either.
    await api.api().post('/api/auth/refresh').set('Cookie', secondCookie).expect(401);
  });

  it('refuses a refresh with no token', async () => {
    await api.api().post('/api/auth/refresh').expect(401);
  });

  it('refuses a token this deployment did not sign', async () => {
    await api
      .api()
      .post('/api/auth/refresh')
      .set('Cookie', `${REFRESH_COOKIE}=not.a.real.token`)
      .expect(401);
  });

  it('logout revokes the token', async () => {
    const user = await db.createUser({ email: 'bye@test.local' });
    const login = await api
      .api()
      .post('/api/auth/login')
      .send({ email: user.email, password: db.PASSWORD })
      .expect(200);
    const cookie = cookieFrom(login);

    await api.api().post('/api/auth/logout').set('Cookie', cookie).expect(200);
    await api.api().post('/api/auth/refresh').set('Cookie', cookie).expect(401);
  });
});

describe('the access token', () => {
  it('is required', async () => {
    await api.api().get('/api/auth/me').expect(401);
    await api.api().get('/api/orders/mine').expect(401);
  });

  it('must be a Bearer token', async () => {
    const user = await db.createUser();
    const token = authService.signAccessToken(user);
    await api.api().get('/api/auth/me').set('Authorization', token).expect(401);
    await api.api().get('/api/auth/me').set('Authorization', `Basic ${token}`).expect(401);
  });

  it('is rejected when it is nonsense', async () => {
    await api.api().get('/api/auth/me').set('Authorization', 'Bearer not.a.token').expect(401);
  });

  it('stops working the moment the account is deactivated', async () => {
    const user = await db.createUser({ role: 'CUSTOMER' });
    const auth = api.authFor(user);

    await api.api().get('/api/auth/me').set(...auth).expect(200);

    await prisma.user.update({ where: { id: user.id }, data: { isActive: false } });

    // Same still-valid token, now refused.
    await api.api().get('/api/auth/me').set(...auth).expect(403);
  });
});

describe('role guards', () => {
  const AREAS = [
    { path: '/api/admin/dashboard', role: 'ADMIN' },
    { path: '/api/designer/jobs', role: 'DESIGNER' },
    { path: '/api/printer/jobs', role: 'PRINTER' },
    { path: '/api/orders/mine', role: 'CUSTOMER' },
  ];

  it.each(AREAS)('$path is open to $role', async ({ path, role }) => {
    const user = await db.createUser({ role });
    await api
      .api()
      .get(path)
      .set(...api.authFor(user))
      .expect(200);
  });

  it.each(AREAS)('$path blocks every other role', async ({ path, role }) => {
    const others = ['ADMIN', 'DESIGNER', 'PRINTER', 'CUSTOMER'].filter((r) => r !== role);
    for (const otherRole of others) {
      const user = await db.createUser({ role: otherRole });
      const res = await api
        .api()
        .get(path)
        .set(...api.authFor(user))
        .expect(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
      expect(res.body.error.details).toMatchObject({ required: [role], yours: otherRole });
    }
  });

  it('lets every role read their own notifications', async () => {
    for (const role of ['ADMIN', 'DESIGNER', 'PRINTER', 'CUSTOMER']) {
      const user = await db.createUser({ role });
      const res = await api
        .api()
        .get('/api/notifications')
        .set(...api.authFor(user))
        .expect(200);
      expect(res.body.data).toMatchObject({ items: [], unreadCount: 0 });
    }
  });

  it('keeps the public routes public', async () => {
    await api.api().get('/api/products').expect(200);
    await api.api().get('/api/health').expect(200);
  });
});

describe('admin user management', () => {
  let admin;
  beforeEach(async () => {
    admin = await db.createUser({ role: 'ADMIN' });
  });

  it('creates designer, printer and admin accounts', async () => {
    for (const role of ['DESIGNER', 'PRINTER', 'ADMIN']) {
      const res = await api
        .api()
        .post('/api/admin/users')
        .set(...api.authFor(admin))
        .send({
          name: `New ${role}`,
          email: `new.${role.toLowerCase()}@test.local`,
          password: 'Staff@12345',
          role,
        })
        .expect(201);
      expect(res.body.data.user.role).toBe(role);

      // The new account can sign in.
      await api
        .api()
        .post('/api/auth/login')
        .send({ email: `new.${role.toLowerCase()}@test.local`, password: 'Staff@12345' })
        .expect(200);
    }
  });

  it('refuses to create a CUSTOMER here', async () => {
    await api
      .api()
      .post('/api/admin/users')
      .set(...api.authFor(admin))
      .send({ name: 'C', email: 'c@test.local', password: 'Staff@12345', role: 'CUSTOMER' })
      .expect(422);
  });

  it('deactivates a user and cuts off their refresh tokens', async () => {
    const designer = await db.createUser({ role: 'DESIGNER', email: 'd@deact.local' });
    const login = await api
      .api()
      .post('/api/auth/login')
      .send({ email: designer.email, password: db.PASSWORD })
      .expect(200);
    const cookie = cookieFrom(login);

    await api
      .api()
      .patch(`/api/admin/users/${designer.id}`)
      .set(...api.authFor(admin))
      .send({ isActive: false })
      .expect(200);

    await api.api().post('/api/auth/refresh').set('Cookie', cookie).expect(401);
    await api
      .api()
      .post('/api/auth/login')
      .send({ email: designer.email, password: db.PASSWORD })
      .expect(403);
  });

  it('lists designers with their open job counts', async () => {
    const designer = await db.createUser({ role: 'DESIGNER' });
    const customer = await db.createUser({ role: 'CUSTOMER' });
    await db.createOrder({ status: 'DESIGN_IN_PROGRESS', customerId: customer.id, designerId: designer.id });
    await db.createOrder({ status: 'COMPLETED', customerId: customer.id, designerId: designer.id });

    const res = await api
      .api()
      .get('/api/admin/users?role=DESIGNER')
      .set(...api.authFor(admin))
      .expect(200);

    const found = res.body.data.users.find((u) => u.id === designer.id);
    // The completed order does not count as open.
    expect(found.openJobs).toBe(1);
  });

  it('serves the print options from constants', async () => {
    const res = await api
      .api()
      .get('/api/admin/print-options')
      .set(...api.authFor(admin))
      .expect(200);
    expect(res.body.data).toMatchObject({
      colors: ['WHITE', 'BLACK'],
      thicknessesMm: [2, 3, 4, 5, 6, 8],
      sizes: ['A1', 'A2', 'A3', 'A4'],
    });
  });
});

describe('the response envelope', () => {
  it('is the same shape on success and on failure', async () => {
    const okRes = await api.api().get('/api/health').expect(200);
    expect(Object.keys(okRes.body).sort()).toEqual(['data', 'error', 'message', 'success']);
    expect(okRes.body.error).toBeNull();

    const errRes = await api.api().get('/api/nope').expect(404);
    expect(Object.keys(errRes.body).sort()).toEqual(['data', 'error', 'message', 'success']);
    expect(errRes.body.data).toBeNull();
    expect(errRes.body.error).toMatchObject({ code: 'NOT_FOUND' });
  });
});
