import { Router, Request, Response } from 'express';
import { getDbPool, sql } from '../config/db';
import { authMiddleware } from '../middleware/auth';

const router = Router();

// GET /api/dashboard/summary
router.get('/summary', authMiddleware, async (req: Request, res: Response) => {
  try {
    const pool = await getDbPool();
    const userId = req.user!.userId;

    // 1. Session counts and repetitions
    const statsRes = await pool
      .request()
      .input('UserId', sql.NVarChar, userId)
      .query(`
        SELECT 
          COUNT(*) as TotalSessions,
          COALESCE(SUM(CompletedRepetitions), 0) as TotalRepetitions,
          AVG(CASE 
            WHEN TargetRepetitions > 0 THEN CAST(CompletedRepetitions AS FLOAT) / TargetRepetitions * 100 
            ELSE NULL 
          END) as AvgCompletionPercentage
        FROM ExerciseSessions
        WHERE UserId = @UserId AND SessionStatus = 'completed'
      `);

    // 2. Latest session
    const latestRes = await pool
      .request()
      .input('UserId', sql.NVarChar, userId)
      .query(`
        SELECT TOP 1 * 
        FROM ExerciseSessions 
        WHERE UserId = @UserId 
        ORDER BY CreatedAt DESC
      `);

    // 3. Thermal count
    const thermalRes = await pool
      .request()
      .input('UserId', sql.NVarChar, userId)
      .query(`
        SELECT COUNT(DISTINCT SessionId) as UsableThermalSessions
        FROM ThermalAnalyses
        WHERE UserId = @UserId AND SessionId IS NOT NULL
      `);

    // 4. Active baseline
    const baselineRes = await pool
      .request()
      .input('UserId', sql.NVarChar, userId)
      .query(`
        SELECT TOP 1 b.*, s.ExerciseType, s.CompletedRepetitions, s.EstimatedRangeOfMotion, s.CompletedAt
        FROM Baselines b
        JOIN ExerciseSessions s ON b.SourceSessionId = s.SessionId
        WHERE b.UserId = @UserId AND b.IsActive = 1
        ORDER BY b.CreatedAt DESC
      `);

    const stats = statsRes.recordset[0] || {};
    const latest = latestRes.recordset[0] || null;
    const thermal = thermalRes.recordset[0] || {};
    const baseline = baselineRes.recordset[0] || null;

    res.json({
      totalSessions: stats.TotalSessions || 0,
      totalRepetitions: stats.TotalRepetitions || 0,
      avgCompletionPercentage: stats.AvgCompletionPercentage ? Math.round(stats.AvgCompletionPercentage * 10) / 10 : 0,
      latestSession: latest,
      latestPainRating: latest?.PainRating ?? null,
      usableThermalSessions: thermal.UsableThermalSessions || 0,
      activeBaseline: baseline,
    });
  } catch (err: any) {
    console.error('Dashboard summary error:', err);
    res.status(500).json({ error: 'Failed to retrieve dashboard summary' });
  }
});

// GET /api/dashboard/progress
router.get('/progress', authMiddleware, async (req: Request, res: Response) => {
  try {
    const pool = await getDbPool();
    const userId = req.user!.userId;

    const result = await pool
      .request()
      .input('UserId', sql.NVarChar, userId)
      .query(`
        SELECT 
          s.SessionId,
          s.CreatedAt,
          s.StartedAt,
          s.CompletedAt,
          s.ExerciseType,
          s.TrackingMode,
          s.DurationSeconds,
          s.CompletedRepetitions,
          s.TargetRepetitions,
          s.EstimatedRangeOfMotion,
          s.MinimumKneeAngle,
          s.MaximumKneeAngle,
          s.PeakAngleVariability,
          s.PainRating,
          s.SorenessRating,
          s.FatigueRating,
          t.AnalysisResultsJson,
          t.TemperatureAvailable
        FROM ExerciseSessions s
        LEFT JOIN (
          SELECT SessionId, AnalysisResultsJson, TemperatureAvailable,
                 ROW_NUMBER() OVER (PARTITION BY SessionId ORDER BY CreatedAt DESC) as rn
          FROM ThermalAnalyses
        ) t ON s.SessionId = t.SessionId AND t.rn = 1
        WHERE s.UserId = @UserId AND s.SessionStatus = 'completed'
        ORDER BY s.CreatedAt ASC
      `);

    const timeseries = result.recordset.map((row) => {
      let thermalAsymmetry: number | null = null;
      let calibratedTempDiff: number | null = null;

      if (row.AnalysisResultsJson) {
        try {
          const parsed = JSON.parse(row.AnalysisResultsJson);
          if (parsed.regional_comparison?.absolute_difference !== undefined) {
            thermalAsymmetry = parsed.regional_comparison.absolute_difference;
          }
          if (parsed.regional_comparison?.temperature_difference !== undefined) {
            calibratedTempDiff = parsed.regional_comparison.temperature_difference;
          }
        } catch {
          // Ignore json parse error
        }
      }

      return {
        sessionId: row.SessionId,
        date: new Date(row.CreatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        fullDate: row.CreatedAt,
        exerciseType: row.ExerciseType,
        trackingMode: row.TrackingMode,
        repetitions: row.CompletedRepetitions,
        targetRepetitions: row.TargetRepetitions,
        completionRate: row.TargetRepetitions > 0 ? Math.round((row.CompletedRepetitions / row.TargetRepetitions) * 100) : 0,
        durationMinutes: Math.round((row.DurationSeconds / 60) * 10) / 10,
        durationSeconds: row.DurationSeconds,
        rangeOfMotion: row.EstimatedRangeOfMotion ?? null,
        peakAngleVariability: row.PeakAngleVariability ?? null,
        painRating: row.PainRating ?? null,
        sorenessRating: row.SorenessRating ?? null,
        fatigueRating: row.FatigueRating ?? null,
        thermalAsymmetry,
        calibratedTempDiff,
      };
    });

    res.json(timeseries);
  } catch (err: any) {
    console.error('Dashboard progress error:', err);
    res.status(500).json({ error: 'Failed to retrieve progress data' });
  }
});

export default router;
