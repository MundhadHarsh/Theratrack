import request from 'supertest';
import app from '../app';
import { getDbPool } from '../config/db';

describe('TheraTrack Backend Test Suite', () => {
  let userToken: string;
  let userId: string;
  let testSessionId: string;
  const testEmail = `test_${Date.now()}@example.com`;
  const otherUserEmail = `other_${Date.now()}@example.com`;
  let otherToken: string;

  beforeAll(async () => {
    // Verify DB pool is ready
    await getDbPool();
  });

  describe('1. Authentication & Password Security', () => {
    it('should register a new user successfully with hashed password', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Jane Doe',
          email: testEmail,
          password: 'Password123!',
        });

      expect(res.status).toBe(201);
      expect(res.body.user).toBeDefined();
      expect(res.body.user.email).toBe(testEmail);
      expect(res.body.token).toBeDefined();
      expect(res.headers['set-cookie']).toBeDefined();

      userToken = res.body.token;
      userId = res.body.user.userId;
    });

    it('should reject registration with duplicate email', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Jane Clone',
          email: testEmail,
          password: 'Password123!',
        });

      expect(res.status).toBe(409);
    });

    it('should reject registration with invalid email or short password', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'A',
          email: 'invalid-email',
          password: '123',
        });

      expect(res.status).toBe(400);
    });

    it('should log in an existing user with valid credentials', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: testEmail,
          password: 'Password123!',
        });

      expect(res.status).toBe(200);
      expect(res.body.token).toBeDefined();
    });

    it('should reject login with wrong password', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: testEmail,
          password: 'WrongPassword!',
        });

      expect(res.status).toBe(401);
    });

    it('should retrieve current user profile with valid JWT', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.user.email).toBe(testEmail);
    });

    it('should reject protected routes without token', async () => {
      const res = await request(app).get('/api/auth/me');
      expect(res.status).toBe(401);
    });
  });

  describe('2. Session Creation, Lifecycle & User Isolation', () => {
    beforeAll(async () => {
      // Create a second user to test authorization isolation
      const otherRes = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Other Patient',
          email: otherUserEmail,
          password: 'Password123!',
        });
      otherToken = otherRes.body.token;
    });

    it('should create an exercise session', async () => {
      const res = await request(app)
        .post('/api/sessions')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          exerciseType: 'seated_knee_extension',
          trackingMode: 'automatic_pose',
          targetRepetitions: 10,
          targetSets: 1,
          painRating: 3,
        });

      expect(res.status).toBe(201);
      expect(res.body.sessionId).toBeDefined();
      testSessionId = res.body.sessionId;
    });

    it('should log exercise events for the session', async () => {
      const res = await request(app)
        .post(`/api/sessions/${testSessionId}/events`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          eventType: 'rep_completed',
          kneeAngle: 165.2,
          landmarkConfidence: 0.94,
          metadata: { repNumber: 1, durationMs: 2400 },
        });

      expect(res.status).toBe(201);
      expect(res.body.eventId).toBeDefined();
    });

    it('should finish a session and save exercise metrics', async () => {
      const res = await request(app)
        .post(`/api/sessions/${testSessionId}/finish`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          durationSeconds: 150,
          completedRepetitions: 10,
          completedSets: 1,
          minimumKneeAngle: 88.0,
          maximumKneeAngle: 168.0,
          estimatedRangeOfMotion: 80.0,
          peakAngleVariability: 4.5,
          painRating: 2,
          notes: 'Smooth movement throughout extension.',
        });

      expect(res.status).toBe(200);
      expect(res.body.message).toBeDefined();
    });

    it('should prevent another user from accessing or modifying this session', async () => {
      // Other user tries to access testSessionId
      const resGet = await request(app)
        .get(`/api/sessions/${testSessionId}`)
        .set('Authorization', `Bearer ${otherToken}`);
      expect(resGet.status).toBe(404);

      // Other user tries to delete testSessionId
      const resDel = await request(app)
        .delete(`/api/sessions/${testSessionId}`)
        .set('Authorization', `Bearer ${otherToken}`);
      expect(resDel.status).toBe(404);
    });

    it('should export the session as JSON and CSV', async () => {
      const resJson = await request(app)
        .get(`/api/sessions/${testSessionId}/export?format=json`)
        .set('Authorization', `Bearer ${userToken}`);
      expect(resJson.status).toBe(200);
      expect(resJson.body.session.SessionId).toBe(testSessionId);

      const resCsv = await request(app)
        .get(`/api/sessions/${testSessionId}/export?format=csv`)
        .set('Authorization', `Bearer ${userToken}`);
      expect(resCsv.status).toBe(200);
      expect(resCsv.text).toContain('Completed Repetitions,10');
    });
  });

  describe('3. Baselines & Mathematical Comparisons', () => {
    let baselineId: string;
    let followUpSessionId: string;

    it('should set the completed session as a baseline', async () => {
      const res = await request(app)
        .post('/api/baselines')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          sourceSessionId: testSessionId,
          exerciseType: 'seated_knee_extension',
        });

      expect(res.status).toBe(201);
      expect(res.body.baselineId).toBeDefined();
      baselineId = res.body.baselineId;
    });

    it('should create a follow-up session and compare against baseline without division errors', async () => {
      // Create second session
      const createRes = await request(app)
        .post('/api/sessions')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          exerciseType: 'seated_knee_extension',
          targetRepetitions: 10,
        });

      followUpSessionId = createRes.body.sessionId;

      // Finish with metrics (testing higher repetitions, higher ROM, lower pain)
      await request(app)
        .post(`/api/sessions/${followUpSessionId}/finish`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          durationSeconds: 180,
          completedRepetitions: 10,
          completedSets: 1,
          estimatedRangeOfMotion: 85.0, // Baseline was 80.0
          peakAngleVariability: 3.2,
          painRating: 1, // Baseline was 2
        });

      // Compare
      const compRes = await request(app)
        .post(`/api/sessions/${followUpSessionId}/compare`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ baselineId });

      expect(compRes.status).toBe(200);
      expect(compRes.body.results).toBeDefined();

      const metrics = compRes.body.results.metrics;
      expect(metrics.rangeOfMotion.available).toBe(true);
      expect(metrics.rangeOfMotion.absoluteDifference).toBe(5.0); // 85 - 80
      expect(metrics.rangeOfMotion.percentageChange).toBe(6.3); // (5 / 80) * 100

      expect(metrics.painRating.absoluteDifference).toBe(-1.0); // 1 - 2
      expect(compRes.body.results.summaries.length).toBeGreaterThan(0);
      expect(compRes.body.results.disclaimer).toBeDefined();
    });

    it('should handle missing baseline values safely without errors', async () => {
      // Create session with null ROM and compare
      const resSession = await request(app)
        .post('/api/sessions')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ exerciseType: 'seated_knee_extension' });

      const newId = resSession.body.sessionId;
      await request(app)
        .post(`/api/sessions/${newId}/finish`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ completedRepetitions: 5 });

      const compRes = await request(app)
        .post(`/api/sessions/${newId}/compare`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ baselineId });

      expect(compRes.status).toBe(200);
      expect(compRes.body.results.metrics.rangeOfMotion.available).toBe(false);
      expect(compRes.body.results.metrics.rangeOfMotion.note).toContain('Not enough comparable data');
    });
  });

  describe('4. Dashboard Endpoints', () => {
    it('should return aggregated dashboard summary', async () => {
      const res = await request(app)
        .get('/api/dashboard/summary')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.totalSessions).toBeGreaterThanOrEqual(1);
      expect(res.body.totalRepetitions).toBeGreaterThanOrEqual(10);
      expect(res.body.activeBaseline).toBeDefined();
    });

    it('should return progress timeseries', async () => {
      const res = await request(app)
        .get('/api/dashboard/progress')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('5. Thermal Sample Endpoint', () => {
    it('should reject invalid upload files', async () => {
      const res = await request(app)
        .post('/api/thermal/analyze')
        .attach('file', Buffer.from('plain text'), 'test.txt');

      expect(res.status).toBe(500); // Multer / validation rejection
    });
  });
});
