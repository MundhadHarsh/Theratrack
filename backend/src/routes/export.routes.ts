import { Router, Request, Response } from 'express';
import { getDbPool, sql } from '../config/db';
import { authMiddleware } from '../middleware/auth';

const router = Router();

// GET /api/sessions/:id/export?format=json|csv
router.get('/:id/export', authMiddleware, async (req: Request, res: Response) => {
  try {
    const sessionId = req.params.id;
    const format = (req.query.format as string)?.toLowerCase() || 'json';
    const pool = await getDbPool();

    const sessionRes = await pool
      .request()
      .input('SessionId', sql.NVarChar, sessionId)
      .input('UserId', sql.NVarChar, req.user!.userId)
      .query('SELECT * FROM ExerciseSessions WHERE SessionId = @SessionId AND UserId = @UserId');

    if (sessionRes.recordset.length === 0) {
      res.status(404).json({ error: 'Session not found or access denied.' });
      return;
    }

    const session = sessionRes.recordset[0];

    const thermalRes = await pool
      .request()
      .input('SessionId', sql.NVarChar, sessionId)
      .query('SELECT * FROM ThermalAnalyses WHERE SessionId = @SessionId');

    const comparisonRes = await pool
      .request()
      .input('SessionId', sql.NVarChar, sessionId)
      .query('SELECT * FROM SessionComparisons WHERE SessionId = @SessionId');

    const eventsRes = await pool
      .request()
      .input('SessionId', sql.NVarChar, sessionId)
      .query('SELECT * FROM ExerciseEvents WHERE SessionId = @SessionId ORDER BY EventTimestamp ASC');

    const exportPayload = {
      theraTrackVersion: '1.0.0',
      exportedAt: new Date().toISOString(),
      disclaimer: 'TheraTrack is a rehabilitation monitoring prototype, not a diagnostic device.',
      session,
      thermalAnalyses: thermalRes.recordset.map((t) => ({
        ...t,
        AnalysisResults: t.AnalysisResultsJson ? JSON.parse(t.AnalysisResultsJson) : null,
      })),
      comparison: comparisonRes.recordset[0]
        ? JSON.parse(comparisonRes.recordset[0].ComparisonResultsJson)
        : null,
      events: eventsRes.recordset.map((e) => ({
        ...e,
        Metadata: e.EventMetadataJson ? JSON.parse(e.EventMetadataJson) : null,
      })),
    };

    if (format === 'csv') {
      const rows: string[] = [
        'Metric,Value,Unit',
        `Session ID,${session.SessionId},`,
        `Exercise Type,${session.ExerciseType},`,
        `Tracking Mode,${session.TrackingMode},`,
        `Status,${session.SessionStatus},`,
        `Started At,${session.StartedAt},`,
        `Completed At,${session.CompletedAt || 'N/A'},`,
        `Duration Seconds,${session.DurationSeconds},seconds`,
        `Completed Repetitions,${session.CompletedRepetitions},reps`,
        `Target Repetitions,${session.TargetRepetitions},reps`,
        `Estimated Range of Motion,${session.EstimatedRangeOfMotion ?? 'N/A'},degrees`,
        `Minimum Knee Angle,${session.MinimumKneeAngle ?? 'N/A'},degrees`,
        `Maximum Knee Angle,${session.MaximumKneeAngle ?? 'N/A'},degrees`,
        `Peak Angle Variability,${session.PeakAngleVariability ?? 'N/A'},degrees`,
        `Pain Rating,${session.PainRating ?? 'N/A'},/10`,
        `Soreness Rating,${session.SorenessRating ?? 'N/A'},/10`,
        `Fatigue Rating,${session.FatigueRating ?? 'N/A'},/10`,
        `Notes,"${(session.Notes || '').replace(/"/g, '""')}",`,
      ];

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="theratrack_session_${sessionId}.csv"`);
      res.send(rows.join('\n'));
      return;
    }

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="theratrack_session_${sessionId}.json"`);
    res.json(exportPayload);
  } catch (err: any) {
    console.error('Export error:', err);
    res.status(500).json({ error: 'Failed to export session' });
  }
});

export default router;
