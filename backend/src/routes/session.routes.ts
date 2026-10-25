import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { getDbPool, sql } from '../config/db';
import { authMiddleware } from '../middleware/auth';

const router = Router();

const createSessionSchema = z.object({
  exerciseType: z.string().default('seated_knee_extension'),
  trackingMode: z.enum(['automatic_pose', 'manual']).default('automatic_pose'),
  targetRepetitions: z.number().int().min(1).default(10),
  targetSets: z.number().int().min(1).default(1),
  painRating: z.number().int().min(0).max(10).optional(),
  sorenessRating: z.number().int().min(0).max(10).optional(),
  fatigueRating: z.number().int().min(0).max(10).optional(),
  notes: z.string().optional(),
});

const finishSessionSchema = z.object({
  durationSeconds: z.number().int().min(0).default(0),
  completedRepetitions: z.number().int().min(0).default(0),
  completedSets: z.number().int().min(1).default(1),
  minimumKneeAngle: z.number().optional(),
  maximumKneeAngle: z.number().optional(),
  estimatedRangeOfMotion: z.number().optional(),
  peakAngleVariability: z.number().optional(),
  targetAngleReachedPercentage: z.number().optional(),
  painRating: z.number().int().min(0).max(10).optional(),
  sorenessRating: z.number().int().min(0).max(10).optional(),
  fatigueRating: z.number().int().min(0).max(10).optional(),
  notes: z.string().optional(),
});

const eventSchema = z.object({
  eventType: z.enum(['rep_completed', 'phase_change', 'target_reached', 'paused', 'resumed']),
  kneeAngle: z.number().optional(),
  landmarkConfidence: z.number().optional(),
  metadata: z.record(z.any()).optional(),
});

// POST /api/sessions - Create session
router.post('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const parse = createSessionSchema.safeParse(req.body);
    if (!parse.success) {
      res.status(400).json({ error: parse.error.errors[0].message });
      return;
    }

    const {
      exerciseType,
      trackingMode,
      targetRepetitions,
      targetSets,
      painRating,
      sorenessRating,
      fatigueRating,
      notes,
    } = parse.data;

    const sessionId = uuidv4();
    const pool = await getDbPool();

    await pool
      .request()
      .input('SessionId', sql.NVarChar, sessionId)
      .input('UserId', sql.NVarChar, req.user!.userId)
      .input('ExerciseType', sql.NVarChar, exerciseType)
      .input('TrackingMode', sql.NVarChar, trackingMode)
      .input('SessionStatus', sql.NVarChar, 'in_progress')
      .input('StartedAt', sql.DateTimeOffset, new Date().toISOString())
      .input('TargetRepetitions', sql.Int, targetRepetitions)
      .input('TargetSets', sql.Int, targetSets)
      .input('PainRating', sql.Int, painRating ?? null)
      .input('SorenessRating', sql.Int, sorenessRating ?? null)
      .input('FatigueRating', sql.Int, fatigueRating ?? null)
      .input('Notes', sql.NVarChar, notes || null)
      .input('IsDemo', sql.Bit, 0)
      .query(`
        INSERT INTO ExerciseSessions (
          SessionId, UserId, ExerciseType, TrackingMode, SessionStatus,
          StartedAt, TargetRepetitions, TargetSets, CompletedRepetitions, CompletedSets,
          PainRating, SorenessRating, FatigueRating, Notes, IsDemo, CreatedAt
        ) VALUES (
          @SessionId, @UserId, @ExerciseType, @TrackingMode, @SessionStatus,
          @StartedAt, @TargetRepetitions, @TargetSets, 0, 1,
          @PainRating, @SorenessRating, @FatigueRating, @Notes, @IsDemo, SYSDATETIMEOFFSET()
        )
      `);

    res.status(201).json({
      sessionId,
      message: 'Session created successfully',
    });
  } catch (err: any) {
    console.error('Create session error:', err);
    res.status(500).json({ error: 'Failed to create exercise session' });
  }
});

// GET /api/sessions - List user sessions
router.get('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const pool = await getDbPool();
    const result = await pool
      .request()
      .input('UserId', sql.NVarChar, req.user!.userId)
      .query(`
        SELECT 
          s.*,
          (SELECT COUNT(*) FROM ThermalAnalyses t WHERE t.SessionId = s.SessionId) as ThermalCount,
          (SELECT COUNT(*) FROM Baselines b WHERE b.SourceSessionId = s.SessionId) as IsBaseline,
          (SELECT COUNT(*) FROM SessionComparisons c WHERE c.SessionId = s.SessionId) as ComparisonCount
        FROM ExerciseSessions s
        WHERE s.UserId = @UserId
        ORDER BY s.CreatedAt DESC
      `);

    res.json(result.recordset);
  } catch (err: any) {
    console.error('List sessions error:', err);
    res.status(500).json({ error: 'Failed to retrieve sessions' });
  }
});

// GET /api/sessions/:id - Get session details
router.get('/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const pool = await getDbPool();
    const sessionRes = await pool
      .request()
      .input('SessionId', sql.NVarChar, req.params.id)
      .input('UserId', sql.NVarChar, req.user!.userId)
      .query('SELECT * FROM ExerciseSessions WHERE SessionId = @SessionId AND UserId = @UserId');

    if (sessionRes.recordset.length === 0) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    const session = sessionRes.recordset[0];

    // Fetch attached thermal analyses
    const thermalRes = await pool
      .request()
      .input('SessionId', sql.NVarChar, req.params.id)
      .query('SELECT * FROM ThermalAnalyses WHERE SessionId = @SessionId ORDER BY CreatedAt DESC');

    // Fetch baseline comparison if exists
    const comparisonRes = await pool
      .request()
      .input('SessionId', sql.NVarChar, req.params.id)
      .query('SELECT * FROM SessionComparisons WHERE SessionId = @SessionId');

    // Fetch repetition events
    const eventsRes = await pool
      .request()
      .input('SessionId', sql.NVarChar, req.params.id)
      .query('SELECT * FROM ExerciseEvents WHERE SessionId = @SessionId ORDER BY EventTimestamp ASC');

    // Check if this session is a baseline
    const baselineRes = await pool
      .request()
      .input('SessionId', sql.NVarChar, req.params.id)
      .query('SELECT BaselineId, IsActive FROM Baselines WHERE SourceSessionId = @SessionId');

    res.json({
      session,
      thermalAnalyses: thermalRes.recordset.map((t) => ({
        ...t,
        AnalysisResults: t.AnalysisResultsJson ? JSON.parse(t.AnalysisResultsJson) : null,
      })),
      comparison: comparisonRes.recordset[0]
        ? {
            ...comparisonRes.recordset[0],
            ComparisonResults: JSON.parse(comparisonRes.recordset[0].ComparisonResultsJson),
          }
        : null,
      events: eventsRes.recordset.map((e) => ({
        ...e,
        Metadata: e.EventMetadataJson ? JSON.parse(e.EventMetadataJson) : null,
      })),
      isBaseline: baselineRes.recordset.length > 0,
      baselineInfo: baselineRes.recordset[0] || null,
    });
  } catch (err: any) {
    console.error('Get session error:', err);
    res.status(500).json({ error: 'Failed to retrieve session details' });
  }
});

// POST /api/sessions/:id/start - Mark session started
router.post('/:id/start', authMiddleware, async (req: Request, res: Response) => {
  try {
    const pool = await getDbPool();
    await pool
      .request()
      .input('SessionId', sql.NVarChar, req.params.id)
      .input('UserId', sql.NVarChar, req.user!.userId)
      .query(`
        UPDATE ExerciseSessions
        SET SessionStatus = 'in_progress', StartedAt = SYSDATETIMEOFFSET()
        WHERE SessionId = @SessionId AND UserId = @UserId
      `);

    res.json({ message: 'Session started' });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to start session' });
  }
});

// POST /api/sessions/:id/events - Record exercise event (repetition or phase transition)
router.post('/:id/events', authMiddleware, async (req: Request, res: Response) => {
  try {
    const parse = eventSchema.safeParse(req.body);
    if (!parse.success) {
      res.status(400).json({ error: parse.error.errors[0].message });
      return;
    }

    const { eventType, kneeAngle, landmarkConfidence, metadata } = parse.data;
    const pool = await getDbPool();

    // Verify session ownership
    const sessionCheck = await pool
      .request()
      .input('SessionId', sql.NVarChar, req.params.id)
      .input('UserId', sql.NVarChar, req.user!.userId)
      .query('SELECT SessionId FROM ExerciseSessions WHERE SessionId = @SessionId AND UserId = @UserId');

    if (sessionCheck.recordset.length === 0) {
      res.status(404).json({ error: 'Session not found or access denied' });
      return;
    }

    const eventId = uuidv4();
    await pool
      .request()
      .input('ExerciseEventId', sql.NVarChar, eventId)
      .input('SessionId', sql.NVarChar, req.params.id)
      .input('EventType', sql.NVarChar, eventType)
      .input('EventTimestamp', sql.DateTimeOffset, new Date().toISOString())
      .input('KneeAngle', sql.Float, kneeAngle ?? null)
      .input('LandmarkConfidence', sql.Float, landmarkConfidence ?? null)
      .input('EventMetadataJson', sql.NVarChar, metadata ? JSON.stringify(metadata) : null)
      .query(`
        INSERT INTO ExerciseEvents (ExerciseEventId, SessionId, EventType, EventTimestamp, KneeAngle, LandmarkConfidence, EventMetadataJson)
        VALUES (@ExerciseEventId, @SessionId, @EventType, @EventTimestamp, @KneeAngle, @LandmarkConfidence, @EventMetadataJson)
      `);

    res.status(201).json({ eventId, message: 'Event logged' });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to log exercise event' });
  }
});

// POST /api/sessions/:id/finish - Finish session with summarized metrics
router.post('/:id/finish', authMiddleware, async (req: Request, res: Response) => {
  try {
    const parse = finishSessionSchema.safeParse(req.body);
    if (!parse.success) {
      res.status(400).json({ error: parse.error.errors[0].message });
      return;
    }

    const pool = await getDbPool();
    const data = parse.data;

    const result = await pool
      .request()
      .input('SessionId', sql.NVarChar, req.params.id)
      .input('UserId', sql.NVarChar, req.user!.userId)
      .input('DurationSeconds', sql.Int, data.durationSeconds)
      .input('CompletedRepetitions', sql.Int, data.completedRepetitions)
      .input('CompletedSets', sql.Int, data.completedSets)
      .input('MinimumKneeAngle', sql.Float, data.minimumKneeAngle ?? null)
      .input('MaximumKneeAngle', sql.Float, data.maximumKneeAngle ?? null)
      .input('EstimatedRangeOfMotion', sql.Float, data.estimatedRangeOfMotion ?? null)
      .input('PeakAngleVariability', sql.Float, data.peakAngleVariability ?? null)
      .input('TargetAngleReachedPercentage', sql.Float, data.targetAngleReachedPercentage ?? null)
      .input('PainRating', sql.Int, data.painRating ?? null)
      .input('SorenessRating', sql.Int, data.sorenessRating ?? null)
      .input('FatigueRating', sql.Int, data.fatigueRating ?? null)
      .input('Notes', sql.NVarChar, data.notes ?? null)
      .query(`
        UPDATE ExerciseSessions
        SET 
          SessionStatus = 'completed',
          CompletedAt = SYSDATETIMEOFFSET(),
          DurationSeconds = @DurationSeconds,
          CompletedRepetitions = @CompletedRepetitions,
          CompletedSets = @CompletedSets,
          MinimumKneeAngle = @MinimumKneeAngle,
          MaximumKneeAngle = @MaximumKneeAngle,
          EstimatedRangeOfMotion = @EstimatedRangeOfMotion,
          PeakAngleVariability = @PeakAngleVariability,
          TargetAngleReachedPercentage = @TargetAngleReachedPercentage,
          PainRating = COALESCE(@PainRating, PainRating),
          SorenessRating = COALESCE(@SorenessRating, SorenessRating),
          FatigueRating = COALESCE(@FatigueRating, FatigueRating),
          Notes = COALESCE(@Notes, Notes)
        WHERE SessionId = @SessionId AND UserId = @UserId
      `);

    if (result.rowsAffected[0] === 0) {
      res.status(404).json({ error: 'Session not found or access denied' });
      return;
    }

    res.json({ message: 'Session completed and metrics saved successfully' });
  } catch (err: any) {
    console.error('Finish session error:', err);
    res.status(500).json({ error: 'Failed to complete session' });
  }
});

// DELETE /api/sessions/:id - Delete session
router.delete('/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const pool = await getDbPool();
    const result = await pool
      .request()
      .input('SessionId', sql.NVarChar, req.params.id)
      .input('UserId', sql.NVarChar, req.user!.userId)
      .query('DELETE FROM ExerciseSessions WHERE SessionId = @SessionId AND UserId = @UserId');

    if (result.rowsAffected[0] === 0) {
      res.status(404).json({ error: 'Session not found or access denied' });
      return;
    }

    res.json({ message: 'Session deleted successfully' });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to delete session' });
  }
});

export default router;
