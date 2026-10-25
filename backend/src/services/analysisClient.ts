import axios, { AxiosInstance } from 'axios';
import FormData from 'form-data';

const ANALYSIS_SERVICE_URL = process.env.ANALYSIS_SERVICE_URL || 'http://127.0.0.1:8001';
const TIMEOUT_MS = 15000;

export interface RoiPayload {
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ProcessingOptionsPayload {
  colormap?: string;
  noise_reduction?: boolean;
  blur_ksize?: number;
  min_display_intensity?: number;
  max_display_intensity?: number;
  threshold_percent?: number;
  rois?: RoiPayload[];
  measurement_type?: string;
  calibrated_temperature_params?: {
    min_temp_c: number;
    max_temp_c: number;
  };
}

class AnalysisClient {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: ANALYSIS_SERVICE_URL,
      timeout: TIMEOUT_MS,
    });
  }

  async checkHealth(): Promise<{ status: string; opencv_version?: string; error?: string }> {
    try {
      const res = await this.client.get('/health');
      return res.data;
    } catch (err: any) {
      return {
        status: 'unreachable',
        error: `Python analysis service unavailable at ${ANALYSIS_SERVICE_URL}: ${err.message}`,
      };
    }
  }

  async getSamples(): Promise<any[]> {
    try {
      const res = await this.client.get('/samples');
      return res.data;
    } catch (err: any) {
      throw new Error(`Failed to fetch samples from Python service: ${err.message}`);
    }
  }

  async analyzeImage(params: {
    fileBuffer?: Buffer;
    originalFilename?: string;
    sampleFilename?: string;
    options?: ProcessingOptionsPayload;
    imageSource?: string;
  }): Promise<any> {
    try {
      const form = new FormData();

      if (params.fileBuffer && params.originalFilename) {
        form.append('file', params.fileBuffer, { filename: params.originalFilename });
      }

      if (params.sampleFilename) {
        form.append('sample_filename', params.sampleFilename);
      }

      if (params.options) {
        form.append('options_json', JSON.stringify(params.options));
      }

      if (params.imageSource) {
        form.append('image_source', params.imageSource);
      }

      const res = await this.client.post('/analyze', form, {
        headers: form.getHeaders(),
      });

      if (!res.data || !res.data.success) {
        throw new Error('Analysis service returned unsuccessful response');
      }

      return res.data;
    } catch (err: any) {
      if (err.response?.data?.detail) {
        throw new Error(`Analysis failed: ${err.response.data.detail}`);
      }
      if (err.code === 'ECONNREFUSED') {
        throw new Error(`Thermal analysis service is not running at ${ANALYSIS_SERVICE_URL}. Please ensure Python service is started on port 8001.`);
      }
      if (err.code === 'ECONNABORTED') {
        throw new Error(`Thermal analysis service timed out after ${TIMEOUT_MS / 1000}s.`);
      }
      throw new Error(`Thermal analysis error: ${err.message}`);
    }
  }

  async compareImages(params: {
    preImageRef: string;
    postImageRef: string;
    rois?: RoiPayload[];
    options?: ProcessingOptionsPayload;
  }): Promise<any> {
    try {
      const res = await this.client.post('/compare', {
        pre_image_ref: params.preImageRef,
        post_image_ref: params.postImageRef,
        rois: params.rois,
        options: params.options,
      });

      return res.data;
    } catch (err: any) {
      if (err.response?.data?.detail) {
        throw new Error(`Image comparison failed: ${err.response.data.detail}`);
      }
      if (err.code === 'ECONNREFUSED') {
        throw new Error(`Thermal analysis service is not running at ${ANALYSIS_SERVICE_URL}.`);
      }
      throw new Error(`Comparison error: ${err.message}`);
    }
  }
}

export const analysisClient = new AnalysisClient();
