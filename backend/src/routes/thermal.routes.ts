import { Router, Request, Response } from 'express';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import { analysisClient } from '../services/analysisClient';
import { getDbPool, sql } from '../config/db';
import { optionalAuthMiddleware, authMiddleware } from '../middleware/auth';

const router = Router();

// Multer in-memory storage for forwarding to Python service
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB limit
  fileFilter: (req, file, cb) => {
    const allowed = ['image/png', 'image/jpeg', 'image/jpg', 'image/bmp', 'image/tiff'];
    if (allowed.includes(file.mimetype) || file.originalname.match(/\.(png|jpe?g|bmp|tiff?)$/i)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid image file type. Supported formats: PNG, JPG, JPEG, BMP, TIFF.'));
    }
  },
});

// GET /api/thermal/samples
router.get('/samples', async (req: Request, res: Response) => {
  try {
    const samples = await analysisClient.getSamples();
    res.json(samples);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/thermal/analyze
router.post('/analyze', optionalAuthMiddleware, upload.single('file'), async (req: Request, res: Response) => {
  try {
    const file = req.file;
    const sampleFilename = req.body.sampleFilename || req.body.sample_filename;
    const imageSource = req.body.imageSource || (sampleFilename ? 'sample' : 'upload');
    const sessionId = req.body.sessionId;
    const optionsJson = req.body.options ? (typeof req.body.options === 'string' ? JSON.parse(req.body.options) : req.body.options) : undefined;

    if (!file && !sampleFilename) {
      res.status(400).json({ error: 'Please provide an image file to upload or select a bundled sample image.' });
      return;
    }

    // Call Python analysis service
    const analysisResult = await analysisClient.analyzeImage({
      fileBuffer: file?.buffer,
      originalFilename: file?.originalname,
      sampleFilename,
      options: optionsJson,
      imageSource,
    });

    // If authenticated user, persist in MSSQL ThermalAnalyses table
    if (req.user) {
      try {
        const pool = await getDbPool();
        const thermalId = uuidv4();

        // Verify session ownership if sessionId provided
        let verifiedSessionId: string | null = null;
        if (sessionId) {
          const sessionCheck = await pool
            .request()
            .input('SessionId', sql.NVarChar, sessionId)
            .input('UserId', sql.NVarChar, req.user.userId)
            .query('SELECT SessionId FROM ExerciseSessions WHERE SessionId = @SessionId AND UserId = @UserId');

          if (sessionCheck.recordset.length > 0) {
            verifiedSessionId = sessionId;
          }
        }

        await pool
          .request()
          .input('ThermalAnalysisId', sql.NVarChar, thermalId)
          .input('SessionId', sql.NVarChar, verifiedSessionId)
          .input('UserId', sql.NVarChar, req.user.userId)
          .input('ImageSource', sql.NVarChar, imageSource)
          .input('AnalysisType', sql.NVarChar, 'single')
          .input('OriginalImageReference', sql.NVarChar, analysisResult.original_image_ref)
          .input('ProcessedImageReference', sql.NVarChar, analysisResult.processed_image_ref)
          .input('MeasurementType', sql.NVarChar, analysisResult.measurement_type)
          .input('TemperatureAvailable', sql.Bit, analysisResult.temperature_available ? 1 : 0)
          .input('ProcessingConfiguration', sql.NVarChar, JSON.stringify(optionsJson || {}))
          .input('AnalysisResultsJson', sql.NVarChar, JSON.stringify(analysisResult))
          .input('IsDemo', sql.Bit, analysisResult.is_demo ? 1 : 0)
          .query(`
            INSERT INTO ThermalAnalyses (
              ThermalAnalysisId, SessionId, UserId, ImageSource, AnalysisType,
              OriginalImageReference, ProcessedImageReference, MeasurementType,
              TemperatureAvailable, ProcessingConfiguration, AnalysisResultsJson,
              IsDemo, CreatedAt
            ) VALUES (
              @ThermalAnalysisId, @SessionId, @UserId, @ImageSource, @AnalysisType,
              @OriginalImageReference, @ProcessedImageReference, @MeasurementType,
              @TemperatureAvailable, @ProcessingConfiguration, @AnalysisResultsJson,
              @IsDemo, SYSDATETIMEOFFSET()
            )
          `);

        analysisResult.thermal_analysis_id = thermalId;
      } catch (dbErr: any) {
        console.warn('Could not persist thermal analysis to DB:', dbErr.message);
      }
    }

    res.json(analysisResult);
  } catch (err: any) {
    console.error('Thermal analyze endpoint error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/thermal/compare (Pre/Post exercise comparison)
router.post('/compare', optionalAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const { preImageRef, postImageRef, rois, options, sessionId } = req.body;

    if (!preImageRef || !postImageRef) {
      res.status(400).json({ error: 'preImageRef and postImageRef are required for comparison.' });
      return;
    }

    const comparisonResult = await analysisClient.compareImages({
      preImageRef,
      postImageRef,
      rois,
      options,
    });

    // Optionally save in DB if user and sessionId are present
    if (req.user && sessionId) {
      try {
        const pool = await getDbPool();
        const thermalId = uuidv4();
        await pool
          .request()
          .input('ThermalAnalysisId', sql.NVarChar, thermalId)
          .input('SessionId', sql.NVarChar, sessionId)
          .input('UserId', sql.NVarChar, req.user.userId)
          .input('ImageSource', sql.NVarChar, 'pre_post_comparison')
          .input('AnalysisType', sql.NVarChar, 'pre_post_comparison')
          .input('OriginalImageReference', sql.NVarChar, preImageRef)
          .input('ProcessedImageReference', sql.NVarChar, comparisonResult.side_by_side_processed_ref || comparisonResult.post_image_ref)
          .input('SecondaryImageReference', sql.NVarChar, postImageRef)
          .input('MeasurementType', sql.NVarChar, 'image_intensity')
          .input('TemperatureAvailable', sql.Bit, comparisonResult.temperature_available ? 1 : 0)
          .input('ProcessingConfiguration', sql.NVarChar, JSON.stringify(options || {}))
          .input('AnalysisResultsJson', sql.NVarChar, JSON.stringify(comparisonResult))
          .input('IsDemo', sql.Bit, 0)
          .query(`
            INSERT INTO ThermalAnalyses (
              ThermalAnalysisId, SessionId, UserId, ImageSource, AnalysisType,
              OriginalImageReference, ProcessedImageReference, SecondaryImageReference,
              MeasurementType, TemperatureAvailable, ProcessingConfiguration,
              AnalysisResultsJson, IsDemo, CreatedAt
            ) VALUES (
              @ThermalAnalysisId, @SessionId, @UserId, @ImageSource, @AnalysisType,
              @OriginalImageReference, @ProcessedImageReference, @SecondaryImageReference,
              @MeasurementType, @TemperatureAvailable, @ProcessingConfiguration,
              @AnalysisResultsJson, @IsDemo, SYSDATETIMEOFFSET()
            )
          `);
      } catch (dbErr: any) {
        console.warn('Could not persist pre/post comparison to DB:', dbErr.message);
      }
    }

    res.json(comparisonResult);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
