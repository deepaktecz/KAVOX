'use strict';

const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { app } = require('../server');

// ─── Test Setup ───────────────────────────────────────────────
let mongod;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();
  process.env.MONGO_URI_TEST = uri;
  process.env.NODE_ENV = 'test';
  process.env.JWT_ACCESS_SECRET = 'test_access_secret_min_32_chars_1234';
  process.env.JWT_REFRESH_SECRET = 'test_refresh_secret_min_32_chars_1234';
  await mongoose.connect(uri);
});

afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.connection.close();
  await mongod.stop();
});

afterEach(async () => {
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }
});

// ─── Test Data ────────────────────────────────────────────────
const validUser = {
  firstName: 'Test',
  lastName: 'User',
  email: 'test@kavox.com',
  password: 'Test@1234',
  confirmPassword: 'Test@1234',
};

// ─── Helper to register and verify user ───────────────────────
async function createVerifiedUser(userData = validUser) {
  const User = require('../models/User');

  const user = await User.create({
    ...userData,
    isEmailVerified: true,
  });

  return user;
}

// ═══════════════════════════════════════════════════════════════
// REGISTER TESTS
// ═══════════════════════════════════════════════════════════════
describe('POST /api/v1/auth/register', () => {
  it('should register a new user successfully', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send(validUser)
      .expect(201);

    expect(res.body.success).toBe(true);
    expect(res.body.data.email).toBe(validUser.email);
    expect(res.body.data.requiresVerification).toBe(true);
  });

  it('should fail with invalid email', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ ...validUser, email: 'invalid-email' })
      .expect(422);

    expect(res.body.success).toBe(false);
    expect(res.body.errors).toBeDefined();
    expect(res.body.errors.some((e) => e.field === 'email')).toBe(true);
  });

  it('should fail with weak password', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ ...validUser, password: 'weak', confirmPassword: 'weak' })
      .expect(422);

    expect(res.body.success).toBe(false);
  });

  it('should fail if passwords do not match', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ ...validUser, confirmPassword: 'Different@123' })
      .expect(422);

    expect(res.body.success).toBe(false);
  });

  it('should fail with duplicate email', async () => {
    await createVerifiedUser();

    const res = await request(app)
      .post('/api/v1/auth/register')
      .send(validUser)
      .expect(409);

    expect(res.body.success).toBe(false);
    expect(res.body.code).toBe('EMAIL_EXISTS');
  });

  it('should allow seller registration', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ ...validUser, role: 'seller' })
      .expect(201);

    expect(res.body.success).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════
// LOGIN TESTS
// ═══════════════════════════════════════════════════════════════
describe('POST /api/v1/auth/login', () => {
  beforeEach(async () => {
    await createVerifiedUser();
  });

  it('should login successfully with valid credentials', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: validUser.email, password: validUser.password })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.accessToken).toBeDefined();
    expect(res.body.data.user.email).toBe(validUser.email);
    expect(res.body.data.user.password).toBeUndefined();
  });

  it('should fail with wrong password', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: validUser.email, password: 'WrongPass@123' })
      .expect(401);

    expect(res.body.success).toBe(false);
    expect(res.body.code).toBe('INVALID_CREDENTIALS');
  });

  it('should fail with unregistered email', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'notfound@test.com', password: validUser.password })
      .expect(401);

    expect(res.body.success).toBe(false);
  });

  it('should fail with missing credentials', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: validUser.email })
      .expect(422);

    expect(res.body.success).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════
// GET /me TESTS
// ═══════════════════════════════════════════════════════════════
describe('GET /api/v1/auth/me', () => {
  it('should return user profile when authenticated', async () => {
    const user = await createVerifiedUser();
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: validUser.email, password: validUser.password });

    const { accessToken } = loginRes.body.data;

    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.user.email).toBe(validUser.email);
    expect(res.body.data.user.password).toBeUndefined();
  });

  it('should return 401 without token', async () => {
    const res = await request(app)
      .get('/api/v1/auth/me')
      .expect(401);

    expect(res.body.success).toBe(false);
    expect(res.body.code).toBe('NO_TOKEN');
  });

  it('should return 401 with invalid token', async () => {
    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', 'Bearer invalid.token.here')
      .expect(401);

    expect(res.body.success).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════
// HEALTH CHECK
// ═══════════════════════════════════════════════════════════════
describe('GET /health', () => {
  it('should return healthy status', async () => {
    const res = await request(app).get('/health').expect(200);
    expect(res.body.success).toBe(true);
    expect(res.body.status).toBe('healthy');
  });
});

// ═══════════════════════════════════════════════════════════════
// FORGOT/RESET PASSWORD TESTS
// ═══════════════════════════════════════════════════════════════
describe('Password Reset Flow', () => {
  beforeEach(async () => {
    await createVerifiedUser();
  });

  it('should return success for forgot password (even for non-existent email)', async () => {
    const res = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: 'nonexistent@test.com' })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.sent).toBe(true);
  });

  it('should return success for valid email in forgot password', async () => {
    const res = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: validUser.email })
      .expect(200);

    expect(res.body.success).toBe(true);
  });
});
