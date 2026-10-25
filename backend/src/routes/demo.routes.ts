import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDbPool, sql } from '../config/db';
import { authMiddleware } from '../middleware/auth';
import { analysisClient } from '../services/analysisClient';

const router = Router();

// POST /api/demo/seed - Seed realistic demonstration sessions
router.post('/seed', authMiddleware, async (req: Request, res: Response) => {
  try {
    const pool = await getDbPool();
    const userId = req.user!.userId;

    // Check if user already has demo data
    const existing = await pool
      .request()
      .input('UserId', sql.NVarChar, userId)
      .query('SELECT COUNT(*) as count FROM ExerciseSessions WHERE UserId = @UserId AND IsDemo = 1');

    if (existing.recordset[0].count > 0) {
      res.status(400).json({
        error: 'Demo records already exist for this account. Clear existing demo data before re-seeding.',
      });
      return;
    }

    const now = new Date();
    const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
    const yesterday = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000);

    // 1. Session 1: Baseline Session (2 days ago)
    const session1Id = uuidv4();
    await pool
      .request()
      .input('SessionId', sql.NVarChar, session1Id)
      .input('UserId', sql.NVarChar, userId)
      .input('ExerciseType', sql.NVarChar, 'seated_knee_extension')
      .input('TrackingMode', sql.NVarChar, 'automatic_pose')
      .input('SessionStatus', sql.NVarChar, 'completed')
      .input('StartedAt', sql.DateTimeOffset, twoDaysAgo.toISOString())
      .input('CompletedAt', sql.DateTimeOffset, new Date(twoDaysAgo.getTime() + 180000).toISOString())
      .input('DurationSeconds', sql.Int, 180)
      .input('TargetRepetitions', sql.Int, 10)
      .input('CompletedRepetitions', sql.Int, 8)
      .input('TargetSets', sql.Int, 1)
      .input('CompletedSets', sql.Int, 1)
      .input('MinimumKneeAngle', sql.Float, 88.5)
      .input('MaximumKneeAngle', sql.Float, 162.0)
      .input('EstimatedRangeOfMotion', sql.Float, 73.5)
      .input('PeakAngleVariability', sql.Float, 5.2)
      .input('TargetAngleReachedPercentage', sql.Float, 75.0)
      .input('PainRating', sql.Int, 4)
      .input('SorenessRating', sql.Int, 3)
      .input('FatigueRating', sql.Int, 5)
      .input('Notes', sql.NVarChar, '[Demo Data] Baseline evaluation session for post-op quad activation.')
      .input('IsDemo', sql.Bit, 1)
      .query(`
        INSERT INTO ExerciseSessions (
          SessionId, UserId, ExerciseType, TrackingMode, SessionStatus,
          StartedAt, CompletedAt, DurationSeconds, TargetRepetitions, CompletedRepetitions,
          TargetSets, CompletedSets, MinimumKneeAngle, MaximumKneeAngle, EstimatedRangeOfMotion,
          PeakAngleVariability, TargetAngleReachedPercentage, PainRating, SorenessRating,
          FatigueRating, Notes, IsDemo, CreatedAt
        ) VALUES (
          @SessionId, @UserId, @ExerciseType, @TrackingMode, @SessionStatus,
          @StartedAt, @CompletedAt, @DurationSeconds, @TargetRepetitions, @CompletedRepetitions,
          @TargetSets, @CompletedSets, @MinimumKneeAngle, @MaximumKneeAngle, @EstimatedRangeOfMotion,
          @PeakAngleVariability, @TargetAngleReachedPercentage, @PainRating, @SorenessRating,
          @FatigueRating, @Notes, @IsDemo, @StartedAt
        )
      `);

    // Attach Resting Thermal Analysis to Session 1
    const thermal1Id = uuidv4();
    let thermal1Result: any = null;
    try {
      thermal1Result = await analysisClient.analyzeImage({
        sampleFilename: 'sample_knees_resting.png',
        imageSource: 'sample',
      });
    } catch (e) {
      // Fallback structured demo
      thermal1Result = {
        success: true,
        image_id: 'demo_rest',
        filename: 'sample_knees_resting.png',
        measurement_type: 'image_intensity',
        temperature_available: false,
        temperature_notice: 'Temperature unavailable — image-intensity analysis only.',
        is_demo: true,
        processed_image_ref: '/api/images/samples/sample_knees_resting.png',
        original_image_ref: '/api/images/samples/sample_knees_resting.png',
        regional_comparison: {
          absolute_difference: 2.1,
          higher_intensity_roi: 'Right ROI',
          interpretation: 'Absolute regional mean difference: 2.1 intensity units.',
        },
      };
    }

    await pool
      .request()
      .input('ThermalAnalysisId', sql.NVarChar, thermal1Id)
      .input('SessionId', sql.NVarChar, session1Id)
      .input('UserId', sql.NVarChar, userId)
      .input('ImageSource', sql.NVarChar, 'sample')
      .input('AnalysisType', sql.NVarChar, 'single')
      .input('OriginalImageReference', sql.NVarChar, thermal1Result.original_image_ref)
      .input('ProcessedImageReference', sql.NVarChar, thermal1Result.processed_image_ref)
      .input('MeasurementType', sql.NVarChar, thermal1Result.measurement_type)
      .input('TemperatureAvailable', sql.Bit, 0)
      .input('ProcessingConfiguration', sql.NVarChar, '{}')
      .input('AnalysisResultsJson', sql.NVarChar, JSON.stringify(thermal1Result))
      .input('IsDemo', sql.Bit, 1)
      .query(`
        INSERT INTO ThermalAnalyses (
          ThermalAnalysisId, SessionId, UserId, ImageSource, AnalysisType,
          OriginalImageReference, ProcessedImageReference, MeasurementType,
          TemperatureAvailable, ProcessingConfiguration, AnalysisResultsJson, IsDemo, CreatedAt
        ) VALUES (
          @ThermalAnalysisId, @SessionId, @UserId, @ImageSource, @AnalysisType,
          @OriginalImageReference, @ProcessedImageReference, @MeasurementType,
          @TemperatureAvailable, @ProcessingConfiguration, @AnalysisResultsJson, @IsDemo, SYSDATETIMEOFFSET()
        )
      `);

    // Set Session 1 as Baseline
    const baselineId = uuidv4();
    await pool
      .request()
      .input('BaselineId', sql.NVarChar, baselineId)
      .input('UserId', sql.NVarChar, userId)
      .input('ExerciseType', sql.NVarChar, 'seated_knee_extension')
      .input('SourceSessionId', sql.NVarChar, session1Id)
      .input(
        'BaselineMetricsJson',
        sql.NVarChar,
        JSON.stringify({
          CompletedRepetitions: 8,
          EstimatedRangeOfMotion: 73.5,
          PeakAngleVariability: 5.2,
          PainRating: 4,
          DurationSeconds: 180,
        })
      )
      .input('IsActive', sql.Bit, 1)
      .query(`
        INSERT INTO Baselines (BaselineId, UserId, ExerciseType, SourceSessionId, BaselineMetricsJson, IsActive, CreatedAt)
        VALUES (@BaselineId, @UserId, @ExerciseType, @SourceSessionId, @BaselineMetricsJson, @IsActive, SYSDATETIMEOFFSET())
      `);

    // 2. Session 2: Mid-Progress Session (Yesterday)
    const session2Id = uuidv4();
    await pool
      .request()
      .input('SessionId', sql.NVarChar, session2Id)
      .input('UserId', sql.NVarChar, userId)
      .input('ExerciseType', sql.NVarChar, 'seated_knee_extension')
      .input('TrackingMode', sql.NVarChar, 'automatic_pose')
      .input('SessionStatus', sql.NVarChar, 'completed')
      .input('StartedAt', sql.DateTimeOffset, yesterday.toISOString())
      .input('CompletedAt', sql.DateTimeOffset, new Date(yesterday.getTime() + 210000).toISOString())
      .input('DurationSeconds', sql.Int, 210)
      .input('TargetRepetitions', sql.Int, 10)
      .input('CompletedRepetitions', sql.Int, 9)
      .input('TargetSets', sql.Int, 1)
      .input('CompletedSets', sql.Int, 1)
      .input('MinimumKneeAngle', sql.Float, 86.0)
      .input('MaximumKneeAngle', sql.Float, 166.5)
      .input('EstimatedRangeOfMotion', sql.Float, 80.5)
      .input('PeakAngleVariability', sql.Float, 4.1)
      .input('TargetAngleReachedPercentage', sql.Float, 88.0)
      .input('PainRating', sql.Int, 3)
      .input('SorenessRating', sql.Int, 2)
      .input('FatigueRating', sql.Int, 4)
      .input('Notes', sql.NVarChar, '[Demo Data] Improved knee extension extension smoothly reached.')
      .input('IsDemo', sql.Bit, 1)
      .query(`
        INSERT INTO ExerciseSessions (
          SessionId, UserId, ExerciseType, TrackingMode, SessionStatus,
          StartedAt, CompletedAt, DurationSeconds, TargetRepetitions, CompletedRepetitions,
          TargetSets, CompletedSets, MinimumKneeAngle, MaximumKneeAngle, EstimatedRangeOfMotion,
          PeakAngleVariability, TargetAngleReachedPercentage, PainRating, SorenessRating,
          FatigueRating, Notes, IsDemo, CreatedAt
        ) VALUES (
          @SessionId, @UserId, @ExerciseType, @TrackingMode, @SessionStatus,
          @StartedAt, @CompletedAt, @DurationSeconds, @TargetRepetitions, @CompletedRepetitions,
          @TargetSets, @CompletedSets, @MinimumKneeAngle, @MaximumKneeAngle, @EstimatedRangeOfMotion,
          @PeakAngleVariability, @TargetAngleReachedPercentage, @PainRating, @SorenessRating,
          @FatigueRating, @Notes, @IsDemo, @StartedAt
        )
      `);

    // 3. Session 3: Today's Latest Session with Pre/Post Exercise Thermal
    const session3Id = uuidv4();
    await pool
      .request()
      .input('SessionId', sql.NVarChar, session3Id)
      .input('UserId', sql.NVarChar, userId)
      .input('ExerciseType', sql.NVarChar, 'seated_knee_extension')
      .input('TrackingMode', sql.NVarChar, 'automatic_pose')
      .input('SessionStatus', sql.NVarChar, 'completed')
      .input('StartedAt', sql.DateTimeOffset, new Date(now.getTime() - 30 * 60 * 1000).toISOString())
      .input('CompletedAt', sql.DateTimeOffset, new Date(now.getTime() - 5 * 60 * 1000).toISOString())
      .input('DurationSeconds', sql.Int, 240)
      .input('TargetRepetitions', sql.Int, 10)
      .input('CompletedRepetitions', sql.Int, 10)
      .input('TargetSets', sql.Int, 1)
      .input('CompletedSets', sql.Int, 1)
      .input('MinimumKneeAngle', sql.Float, 85.0)
      .input('MaximumKneeAngle', sql.Float, 171.0)
      .input('EstimatedRangeOfMotion', sql.Float, 86.0)
      .input('PeakAngleVariability', sql.Float, 3.4)
      .input('TargetAngleReachedPercentage', sql.Float, 100.0)
      .input('PainRating', sql.Int, 2)
      .input('SorenessRating', sql.Int, 2)
      .input('FatigueRating', sql.Int, 3)
      .input('Notes', sql.NVarChar, '[Demo Data] Full 10/10 target completed with reduced pain and solid ROM stability.')
      .input('IsDemo', sql.Bit, 1)
      .query(`
        INSERT INTO ExerciseSessions (
          SessionId, UserId, ExerciseType, TrackingMode, SessionStatus,
          StartedAt, CompletedAt, DurationSeconds, TargetRepetitions, CompletedRepetitions,
          TargetSets, CompletedSets, MinimumKneeAngle, MaximumKneeAngle, EstimatedRangeOfMotion,
          PeakAngleVariability, TargetAngleReachedPercentage, PainRating, SorenessRating,
          FatigueRating, Notes, IsDemo, CreatedAt
        ) VALUES (
          @SessionId, @UserId, @ExerciseType, @TrackingMode, @SessionStatus,
          @StartedAt, @CompletedAt, @DurationSeconds, @TargetRepetitions, @CompletedRepetitions,
          @TargetSets, @CompletedSets, @MinimumKneeAngle, @MaximumKneeAngle, @EstimatedRangeOfMotion,
          @PeakAngleVariability, @TargetAngleReachedPercentage, @PainRating, @SorenessRating,
          @FatigueRating, @Notes, @IsDemo, @StartedAt
        )
      `);

    // Attach Post-Exercise Thermal Analysis to Session 3
    let thermal3Result: any = null;
    try {
      thermal3Result = await analysisClient.analyzeImage({
        sampleFilename: 'sample_knees_post_exercise.png',
        imageSource: 'sample',
      });
    } catch {
      thermal3Result = {
        success: true,
        image_id: 'demo_post',
        filename: 'sample_knees_post_exercise.png',
        measurement_type: 'image_intensity',
        temperature_available: false,
        temperature_notice: 'Temperature unavailable — image-intensity analysis only.',
        is_demo: true,
        processed_image_ref: '/api/images/samples/sample_knees_post_exercise.png',
        original_image_ref: '/api/images/samples/sample_knees_post_exercise.png',
        regional_comparison: {
          absolute_difference: 26.0,
          higher_intensity_roi: 'Right ROI',
          interpretation: 'Absolute regional mean difference: 26.0 intensity units. Higher in Right ROI.',
        },
      };
    }

    const thermal3Id = uuidv4();
    await pool
      .request()
      .input('ThermalAnalysisId', sql.NVarChar, thermal3Id)
      .input('SessionId', sql.NVarChar, session3Id)
      .input('UserId', sql.NVarChar, userId)
      .input('ImageSource', sql.NVarChar, 'sample')
      .input('AnalysisType', sql.NVarChar, 'single')
      .input('OriginalImageReference', sql.NVarChar, thermal3Result.original_image_ref)
      .input('ProcessedImageReference', sql.NVarChar, thermal3Result.processed_image_ref)
      .input('MeasurementType', sql.NVarChar, thermal3Result.measurement_type)
      .input('TemperatureAvailable', sql.Bit, 0)
      .input('ProcessingConfiguration', sql.NVarChar, '{}')
      .input('AnalysisResultsJson', sql.NVarChar, JSON.stringify(thermal3Result))
      .input('IsDemo', sql.Bit, 1)
      .query(`
        INSERT INTO ThermalAnalyses (
          ThermalAnalysisId, SessionId, UserId, ImageSource, AnalysisType,
          OriginalImageReference, ProcessedImageReference, MeasurementType,
          TemperatureAvailable, ProcessingConfiguration, AnalysisResultsJson, IsDemo, CreatedAt
        ) VALUES (
          @ThermalAnalysisId, @SessionId, @UserId, @ImageSource, @AnalysisType,
          @OriginalImageReference, @ProcessedImageReference, @MeasurementType,
          @TemperatureAvailable, @ProcessingConfiguration, @AnalysisResultsJson, @IsDemo, SYSDATETIMEOFFSET()
        )
      `);

    // Attach Session Comparison for Session 3 vs Baseline
    const comparison3Id = uuidv4();
    const comparison3Output = {
      metrics: {
        repetitions: {
          label: 'Completed repetitions',
          available: true,
          currentValue: 10,
          baselineValue: 8,
          absoluteDifference: 2,
          percentageChange: 25.0,
          unit: ' reps',
        },
        rangeOfMotion: {
          label: 'Estimated knee-angle range',
          available: true,
          currentValue: 86.0,
          baselineValue: 73.5,
          absoluteDifference: 12.5,
          percentageChange: 17.0,
          unit: '°',
        },
        peakAngleVariability: {
          label: 'Peak-angle variability',
          available: true,
          currentValue: 3.4,
          baselineValue: 5.2,
          absoluteDifference: -1.8,
          percentageChange: -34.6,
          unit: '°',
        },
        painRating: {
          label: 'Self-reported pain rating',
          available: true,
          currentValue: 2,
          baselineValue: 4,
          absoluteDifference: -2,
          percentageChange: -50.0,
          unit: '/10',
        },
      },
      summaries: [
        'Completed 10 of 10 target repetitions (increased by 2 reps compared with baseline).',
        'Estimated knee-angle range increased by 12.5° compared with baseline (86° vs 73.5°).',
        'Peak-angle variability was lower than in the baseline session (3.4° vs 5.2°).',
        'Self-reported pain decreased from 4/10 to 2/10.',
      ],
      evaluatedAt: new Date().toISOString(),
      disclaimer: 'TheraTrack is a rehabilitation monitoring prototype, not a diagnostic device.',
    };

    await pool
      .request()
      .input('ComparisonId', sql.NVarChar, comparison3Id)
      .input('SessionId', sql.NVarChar, session3Id)
      .input('BaselineId', sql.NVarChar, baselineId)
      .input('ComparisonResultsJson', sql.NVarChar, JSON.stringify(comparison3Output))
      .query(`
        INSERT INTO SessionComparisons (ComparisonId, SessionId, BaselineId, ComparisonResultsJson, CreatedAt)
        VALUES (@ComparisonId, @SessionId, @BaselineId, @ComparisonResultsJson, SYSDATETIMEOFFSET())
      `);

    res.json({
      message: 'Demonstration dataset seeded successfully with 3 progressive sessions, baseline, thermal analysis, and comparisons.',
      sessionsSeeded: 3,
      baselineId,
      latestSessionId: session3Id,
    });
  } catch (err: any) {
    console.error('Seed demo error:', err);
    res.status(500).json({ error: 'Failed to seed demonstration data: ' + err.message });
  }
});

// POST /api/demo/clear - Safely remove demonstration records
router.post('/clear', authMiddleware, async (req: Request, res: Response) => {
  try {
    const pool = await getDbPool();
    const userId = req.user!.userId;

    // Delete thermal analyses marked demo
    await pool
      .request()
      .input('UserId', sql.NVarChar, userId)
      .query('DELETE FROM ThermalAnalyses WHERE UserId = @UserId AND IsDemo = 1');

    // Delete baselines connected to demo sessions
    await pool
      .request()
      .input('UserId', sql.NVarChar, userId)
      .query(`
        DELETE FROM Baselines 
        WHERE UserId = @UserId AND SourceSessionId IN (
          SELECT SessionId FROM ExerciseSessions WHERE UserId = @UserId AND IsDemo = 1
        )
      `);

    // Delete demo sessions (cascade deletes comparisons and events)
    const result = await pool
      .request()
      .input('UserId', sql.NVarChar, userId)
      .query('DELETE FROM ExerciseSessions WHERE UserId = @UserId AND IsDemo = 1');

    res.json({
      message: 'Demonstration records cleared successfully.',
      sessionsRemoved: result.rowsAffected[0],
    });
  } catch (err: any) {
    console.error('Clear demo error:', err);
    res.status(500).json({ error: 'Failed to clear demonstration data' });
  }
});

export default router;
