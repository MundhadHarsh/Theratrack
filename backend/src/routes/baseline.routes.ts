import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { getDbPool, sql } from '../config/db';
import { authMiddleware } from '../middleware/auth';

const router = Router();

const createBaselineSchema = z.object({
  sourceSessionId: z.string().min(1, 'Source session ID is required'),
  exerciseType: z.string().default('seated_knee_extension'),
});

function calculateComparison(curr: any, base: any, currThermal: any, baseThermal: any) {
  const comparisons: Record<string, any> = {};
  const summaries: string[] = [];

  function compareMetric(
    key: string,
    label: string,
    currVal?: number | null,
    baseVal?: number | null,
    unit: string = '',
    reverseGood: boolean = false
  ) {
    if (currVal === null || currVal === undefined || baseVal === null || baseVal === undefined) {
      comparisons[key] = { label, available: false, note: 'Not enough comparable data.' };
      return;
    }

    const absDiff = Math.round((currVal - baseVal) * 100) / 100;
    let pctChange: number | null = null;
    if (Math.abs(baseVal) > 0.0001) {
      pctChange = Math.round(((currVal - baseVal) / baseVal) * 1000) / 10;
    }

    comparisons[key] = {
      label,
      available: true,
      currentValue: currVal,
      baselineValue: baseVal,
      absoluteDifference: absDiff,
      percentageChange: pctChange,
      unit,
    };

    if (absDiff === 0) {
      summaries.push(`${label} remained unchanged at ${currVal}${unit}.`);
    } else if (absDiff > 0) {
      summaries.push(`${label} increased by ${absDiff}${unit} compared with baseline (${currVal}${unit} vs ${baseVal}${unit}).`);
    } else {
      summaries.push(`${label} decreased by ${Math.abs(absDiff)}${unit} compared with baseline (${currVal}${unit} vs ${baseVal}${unit}).`);
    }
  }

  // 1. Repetitions
  compareMetric('repetitions', 'Completed repetitions', curr.CompletedRepetitions, base.CompletedRepetitions, ' reps');

  // 2. Completion Percentage
  const currPct = curr.TargetRepetitions > 0 ? Math.round((curr.CompletedRepetitions / curr.TargetRepetitions) * 100) : null;
  const basePct = base.TargetRepetitions > 0 ? Math.round((base.CompletedRepetitions / base.TargetRepetitions) * 100) : null;
  compareMetric('completionPercentage', 'Target completion rate', currPct, basePct, '%');

  // 3. Estimated Range of Motion
  compareMetric('rangeOfMotion', 'Estimated knee-angle range', curr.EstimatedRangeOfMotion, base.EstimatedRangeOfMotion, '°');

  // 4. Peak Angle Variability
  compareMetric('peakAngleVariability', 'Peak-angle variability', curr.PeakAngleVariability, base.PeakAngleVariability, '°', true);

  // 5. Pain Rating
  compareMetric('painRating', 'Self-reported pain rating', curr.PainRating, base.PainRating, '/10', true);

  // 6. Fatigue Rating
  compareMetric('fatigueRating', 'Self-reported fatigue rating', curr.FatigueRating, base.FatigueRating, '/10', true);

  // 7. Thermal Left/Right Intensity Difference
  let currThermalDiff: number | null = null;
  let baseThermalDiff: number | null = null;

  if (currThermal?.AnalysisResults?.regional_comparison?.absolute_difference !== undefined) {
    currThermalDiff = currThermal.AnalysisResults.regional_comparison.absolute_difference;
  }
  if (baseThermal?.AnalysisResults?.regional_comparison?.absolute_difference !== undefined) {
    baseThermalDiff = baseThermal.AnalysisResults.regional_comparison.absolute_difference;
  }
  compareMetric('thermalAsymmetry', 'Left/right mean pixel-intensity difference', currThermalDiff, baseThermalDiff, ' units');

  return {
    metrics: comparisons,
    summaries,
    evaluatedAt: new Date().toISOString(),
    disclaimer:
      'TheraTrack is a rehabilitation monitoring prototype, not a diagnostic device. Its measurements are estimates and must not replace a physiotherapist assessment.',
  };
}

// POST /api/baselines - Set a completed session as baseline
router.post('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const parse = createBaselineSchema.safeParse(req.body);
    if (!parse.success) {
      res.status(400).json({ error: parse.error.errors[0].message });
      return;
    }

    const { sourceSessionId, exerciseType } = parse.data;
    const pool = await getDbPool();

    // Verify session belongs to user and is completed
    const sessionRes = await pool
      .request()
      .input('SessionId', sql.NVarChar, sourceSessionId)
      .input('UserId', sql.NVarChar, req.user!.userId)
      .query('SELECT * FROM ExerciseSessions WHERE SessionId = @SessionId AND UserId = @UserId');

    if (sessionRes.recordset.length === 0) {
      res.status(404).json({ error: 'Source session not found or does not belong to you.' });
      return;
    }

    const session = sessionRes.recordset[0];
    if (session.ExerciseType !== exerciseType) {
      res.status(400).json({
        error: `Session exercise type '${session.ExerciseType}' does not match requested baseline exercise type '${exerciseType}'.`,
      });
      return;
    }

    // Deactivate previous active baseline for this exercise
    await pool
      .request()
      .input('UserId', sql.NVarChar, req.user!.userId)
      .input('ExerciseType', sql.NVarChar, exerciseType)
      .query('UPDATE Baselines SET IsActive = 0 WHERE UserId = @UserId AND ExerciseType = @ExerciseType');

    const baselineId = uuidv4();
    await pool
      .request()
      .input('BaselineId', sql.NVarChar, baselineId)
      .input('UserId', sql.NVarChar, req.user!.userId)
      .input('ExerciseType', sql.NVarChar, exerciseType)
      .input('SourceSessionId', sql.NVarChar, sourceSessionId)
      .input('BaselineMetricsJson', sql.NVarChar, JSON.stringify(session))
      .input('IsActive', sql.Bit, 1)
      .query(`
        INSERT INTO Baselines (BaselineId, UserId, ExerciseType, SourceSessionId, BaselineMetricsJson, IsActive, CreatedAt)
        VALUES (@BaselineId, @UserId, @ExerciseType, @SourceSessionId, @BaselineMetricsJson, @IsActive, SYSDATETIMEOFFSET())
      `);

    res.status(201).json({
      baselineId,
      message: 'Baseline established successfully for ' + exerciseType,
    });
  } catch (err: any) {
    console.error('Create baseline error:', err);
    res.status(500).json({ error: 'Failed to create baseline' });
  }
});

// GET /api/baselines - List user baselines
router.get('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const pool = await getDbPool();
    const result = await pool
      .request()
      .input('UserId', sql.NVarChar, req.user!.userId)
      .query(`
        SELECT 
          b.*,
          s.CompletedRepetitions,
          s.EstimatedRangeOfMotion,
          s.PeakAngleVariability,
          s.PainRating,
          s.CompletedAt as SourceSessionCompletedAt
        FROM Baselines b
        JOIN ExerciseSessions s ON b.SourceSessionId = s.SessionId
        WHERE b.UserId = @UserId
        ORDER BY b.CreatedAt DESC
      `);

    res.json(result.recordset);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to retrieve baselines' });
  }
});

// GET /api/baselines/:id - Get baseline details
router.get('/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const pool = await getDbPool();
    const result = await pool
      .request()
      .input('BaselineId', sql.NVarChar, req.params.id)
      .input('UserId', sql.NVarChar, req.user!.userId)
      .query(`
        SELECT b.*, s.CompletedRepetitions, s.EstimatedRangeOfMotion, s.PeakAngleVariability, s.PainRating
        FROM Baselines b
        JOIN ExerciseSessions s ON b.SourceSessionId = s.SessionId
        WHERE b.BaselineId = @BaselineId AND b.UserId = @UserId
      `);

    if (result.recordset.length === 0) {
      res.status(404).json({ error: 'Baseline not found' });
      return;
    }

    const baseline = result.recordset[0];
    res.json({
      ...baseline,
      BaselineMetrics: JSON.parse(baseline.BaselineMetricsJson),
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to retrieve baseline details' });
  }
});

// POST /api/sessions/:id/compare - Compare session against baseline
export async function handleSessionCompare(req: Request, res: Response) {
  try {
    const sessionId = req.params.id;
    const requestedBaselineId = req.body?.baselineId;
    const pool = await getDbPool();

    // 1. Fetch current session
    const currRes = await pool
      .request()
      .input('SessionId', sql.NVarChar, sessionId)
      .input('UserId', sql.NVarChar, req.user!.userId)
      .query('SELECT * FROM ExerciseSessions WHERE SessionId = @SessionId AND UserId = @UserId');

    if (currRes.recordset.length === 0) {
      res.status(404).json({ error: 'Session not found or access denied.' });
      return;
    }

    const currSession = currRes.recordset[0];

    // 2. Fetch baseline (either specified baseline or active baseline for this exercise)
    let baselineQuery = 'SELECT * FROM Baselines WHERE UserId = @UserId AND ExerciseType = @ExerciseType';
    const reqBase = pool
      .request()
      .input('UserId', sql.NVarChar, req.user!.userId)
      .input('ExerciseType', sql.NVarChar, currSession.ExerciseType);

    if (requestedBaselineId) {
      baselineQuery += ' AND BaselineId = @BaselineId';
      reqBase.input('BaselineId', sql.NVarChar, requestedBaselineId);
    } else {
      baselineQuery += ' AND IsActive = 1';
    }

    const baseRes = await reqBase.query(baselineQuery);
    if (baseRes.recordset.length === 0) {
      res.status(400).json({
        error: `No active baseline found for exercise type '${currSession.ExerciseType}'. Please establish a baseline session first.`,
      });
      return;
    }

    const baseline = baseRes.recordset[0];
    const baseSourceSessionRes = await pool
      .request()
      .input('SessionId', sql.NVarChar, baseline.SourceSessionId)
      .query('SELECT * FROM ExerciseSessions WHERE SessionId = @SessionId');

    if (baseSourceSessionRes.recordset.length === 0) {
      res.status(400).json({ error: 'Source session for this baseline is missing.' });
      return;
    }

    const baseSession = baseSourceSessionRes.recordset[0];

    // Check exercise compatibility
    if (currSession.ExerciseType !== baseSession.ExerciseType) {
      res.status(400).json({
        error: `Cannot compare incompatible exercise types: '${currSession.ExerciseType}' vs '${baseSession.ExerciseType}'.`,
      });
      return;
    }

    // Fetch thermal analyses for both if available
    const currThermalRes = await pool
      .request()
      .input('SessionId', sql.NVarChar, sessionId)
      .query('SELECT TOP 1 * FROM ThermalAnalyses WHERE SessionId = @SessionId ORDER BY CreatedAt DESC');
    const baseThermalRes = await pool
      .request()
      .input('SessionId', sql.NVarChar, baseline.SourceSessionId)
      .query('SELECT TOP 1 * FROM ThermalAnalyses WHERE SessionId = @SessionId ORDER BY CreatedAt DESC');

    const currThermal = currThermalRes.recordset[0]
      ? {
          ...currThermalRes.recordset[0],
          AnalysisResults: JSON.parse(currThermalRes.recordset[0].AnalysisResultsJson),
        }
      : null;
    const baseThermal = baseThermalRes.recordset[0]
      ? {
          ...baseThermalRes.recordset[0],
          AnalysisResults: JSON.parse(baseThermalRes.recordset[0].AnalysisResultsJson),
        }
      : null;

    const comparisonOutput = calculateComparison(currSession, baseSession, currThermal, baseThermal);

    // Save in SessionComparisons table (upsert)
    const compId = uuidv4();
    await pool
      .request()
      .input('ComparisonId', sql.NVarChar, compId)
      .input('SessionId', sql.NVarChar, sessionId)
      .input('BaselineId', sql.NVarChar, baseline.BaselineId)
      .input('ComparisonResultsJson', sql.NVarChar, JSON.stringify(comparisonOutput))
      .query(`
        IF EXISTS (SELECT 1 FROM SessionComparisons WHERE SessionId = @SessionId)
        BEGIN
          UPDATE SessionComparisons
          SET BaselineId = @BaselineId, ComparisonResultsJson = @ComparisonResultsJson, CreatedAt = SYSDATETIMEOFFSET()
          WHERE SessionId = @SessionId
        END
        ELSE
        BEGIN
          INSERT INTO SessionComparisons (ComparisonId, SessionId, BaselineId, ComparisonResultsJson, CreatedAt)
          VALUES (@ComparisonId, @SessionId, @BaselineId, @ComparisonResultsJson, SYSDATETIMEOFFSET())
        END
      `);

    res.json({
      comparisonId: compId,
      sessionId,
      baselineId: baseline.BaselineId,
      results: comparisonOutput,
    });
  } catch (err: any) {
    console.error('Session compare error:', err);
    res.status(500).json({ error: 'Failed to perform session comparison' });
  }
}

export default router;
