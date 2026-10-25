import React, { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import {
  Flame,
  Upload,
  Layers,
  Sliders,
  CheckCircle2,
  AlertTriangle,
  Info,
  RefreshCw,
  GitCompare,
  ArrowRight,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
} from 'recharts';
import { apiRequest } from '../api/client';
import { MedicalDisclaimer } from '../components/MedicalDisclaimer';

interface SampleImage {
  filename: string;
  title: string;
  description: string;
  type: string;
  image_ref: string;
  is_demo: boolean;
}

interface RoiStat {
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  pixel_count: number;
  mean_intensity: number;
  median_intensity: number;
  min_intensity: number;
  max_intensity: number;
  std_intensity: number;
  percent_above_threshold: number;
  intensity_threshold_value: number;
  histogram: number[];
  temperature_stats?: any;
}

interface RegionalComparison {
  roi1_label: string;
  roi2_label: string;
  absolute_difference: number;
  signed_difference: number;
  relative_percent_difference: number | null;
  higher_intensity_roi: string;
  temperature_difference?: number;
  interpretation: string;
}

interface AnalysisResult {
  success: boolean;
  image_id: string;
  filename: string;
  width: number;
  height: number;
  image_source: string;
  measurement_type: string;
  temperature_available: boolean;
  temperature_notice: string;
  is_demo: boolean;
  processed_image_ref: string;
  original_image_ref: string;
  roi_statistics: RoiStat[];
  regional_comparison?: RegionalComparison;
  validation_warnings: string[];
}

export const ThermalAnalysis: React.FC = () => {
  const [searchParams] = useSearchParams();
  const linkedSessionId = searchParams.get('sessionId') || undefined;

  // Mode: Single image analysis vs Pre/Post Exercise comparison
  const [activeTab, setActiveTab] = useState<'single' | 'pre_post'>('single');

  // Input source
  const [sourceType, setSourceType] = useState<'sample' | 'upload'>('sample');
  const [samples, setSamples] = useState<SampleImage[]>([]);
  const [selectedSample, setSelectedSample] = useState<string>('sample_knees_resting.png');
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [uploadPreviewUrl, setUploadPreviewUrl] = useState<string | null>(null);

  // Colormap & Processing parameters
  const [colormap, setColormap] = useState('inferno');
  const [noiseReduction, setNoiseReduction] = useState(true);
  const [minDisplay, setMinDisplay] = useState(0);
  const [maxDisplay, setMaxDisplay] = useState(255);
  const [thresholdPercent, setThresholdPercent] = useState(75);

  // Region of Interest selections
  const [leftLabel, setLeftLabel] = useState('Left Knee ROI');
  const [leftX, setLeftX] = useState(130);
  const [leftY, setLeftY] = useState(215);
  const [leftW, setLeftW] = useState(140);
  const [leftH, setLeftH] = useState(140);

  const [rightLabel, setRightLabel] = useState('Right Knee ROI');
  const [rightX, setRightX] = useState(370);
  const [rightY, setRightY] = useState(215);
  const [rightW, setRightW] = useState(140);
  const [rightH, setRightH] = useState(140);

  // Processing state
  const [isProcessing, setIsProcessing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Pre/Post Comparison Mode State
  const [preImageSample, setPreImageSample] = useState('sample_knees_pre_exercise.png');
  const [postImageSample, setPostImageSample] = useState('sample_knees_post_exercise.png');
  const [prePostResult, setPrePostResult] = useState<any | null>(null);
  const [isComparing, setIsComparing] = useState(false);

  // Fetch available sample thermal images on load
  useEffect(() => {
    apiRequest<SampleImage[]>('/api/thermal/samples')
      .then((data) => {
        setSamples(data);
        if (data.length > 0 && !selectedSample) {
          setSelectedSample(data[0].filename);
        }
      })
      .catch((err) => {
        console.warn('Could not load samples:', err);
      });
  }, []);

  // Handle file upload selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setUploadedFile(file);
      setUploadPreviewUrl(URL.createObjectURL(file));
      setSourceType('upload');
    }
  };

  // Submit Single Thermal Analysis to Node.js backend -> Python service
  const handleAnalyze = async () => {
    setIsProcessing(true);
    setError(null);

    try {
      const formData = new FormData();
      if (sourceType === 'upload' && uploadedFile) {
        formData.append('file', uploadedFile);
        formData.append('imageSource', 'upload');
      } else {
        formData.append('sampleFilename', selectedSample);
        formData.append('imageSource', 'sample');
      }

      if (linkedSessionId) {
        formData.append('sessionId', linkedSessionId);
      }

      const options = {
        colormap,
        noise_reduction: noiseReduction,
        blur_ksize: 3,
        min_display_intensity: Number(minDisplay),
        max_display_intensity: Number(maxDisplay),
        threshold_percent: Number(thresholdPercent),
        rois: [
          { label: leftLabel, x: Number(leftX), y: Number(leftY), width: Number(leftW), height: Number(leftH) },
          { label: rightLabel, x: Number(rightX), y: Number(rightY), width: Number(rightW), height: Number(rightH) },
        ],
      };

      formData.append('options', JSON.stringify(options));

      const res = await apiRequest<AnalysisResult>('/api/thermal/analyze', {
        method: 'POST',
        body: formData,
      });

      setAnalysisResult(res);
    } catch (err: any) {
      setError(err.message || 'Analysis failed. Please verify the Python service is active.');
    } finally {
      setIsProcessing(false);
    }
  };

  // Submit Pre/Post Exercise Comparison
  const handlePrePostCompare = async () => {
    setIsComparing(true);
    setError(null);
    try {
      const res = await apiRequest('/api/thermal/compare', {
        method: 'POST',
        body: JSON.stringify({
          preImageRef: `/api/images/samples/${preImageSample}`,
          postImageRef: `/api/images/samples/${postImageSample}`,
          sessionId: linkedSessionId,
          rois: [
            { label: leftLabel, x: Number(leftX), y: Number(leftY), width: Number(leftW), height: Number(leftH) },
            { label: rightLabel, x: Number(rightX), y: Number(rightY), width: Number(rightW), height: Number(rightH) },
          ],
          options: {
            colormap,
            noise_reduction: noiseReduction,
          },
        }),
      });

      setPrePostResult(res);
    } catch (err: any) {
      setError(err.message || 'Pre/post comparison failed.');
    } finally {
      setIsComparing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider text-teal-700 bg-teal-100 px-2 py-0.5 rounded">
              Module A
            </span>
            {linkedSessionId && (
              <span className="text-xs text-slate-500 font-mono">Linked Session: {linkedSessionId.slice(0, 8)}</span>
            )}
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Thermal Image Processing</h1>
          <p className="text-sm text-slate-500">
            OpenCV & NumPy false-color mapping, ROI statistical distributions, and bilateral asymmetry analysis.
          </p>
        </div>

        {/* Tab switch: Single analysis vs Pre/Post */}
        <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200">
          <button
            onClick={() => setActiveTab('single')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 ${
              activeTab === 'single' ? 'bg-white text-teal-800 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Flame className="w-3.5 h-3.5" />
            <span>Single Image Analysis</span>
          </button>
          <button
            onClick={() => setActiveTab('pre_post')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 ${
              activeTab === 'pre_post' ? 'bg-white text-teal-800 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <GitCompare className="w-3.5 h-3.5" />
            <span>Pre/Post Comparison</span>
          </button>
        </div>
      </div>

      <MedicalDisclaimer />

      {/* Mandatory Physical Temperature Distinction Banner */}
      <div className="bg-amber-50 border border-amber-200 p-3.5 rounded-xl text-amber-800 text-xs flex items-center gap-3">
        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
        <div>
          <span className="font-bold">Temperature unavailable — image-intensity analysis only.</span>
          <span className="ml-1 text-amber-700">
            Standard RGB/grayscale thermal images represent optical intensity distributions, not calibrated degrees Celsius.
          </span>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* TAB 1: SINGLE IMAGE ANALYSIS */}
      {activeTab === 'single' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Controls Column */}
          <div className="healthcare-card p-5 space-y-5">
            <h2 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
              <Sliders className="w-4 h-4 text-teal-600" />
              <span>Input & Processing Controls</span>
            </h2>

            {/* Source Selector */}
            <div className="space-y-2">
              <label className="block text-xs font-medium text-slate-700">Thermal Image Source</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setSourceType('sample')}
                  className={`py-2 px-3 text-xs font-semibold rounded-lg border text-center transition-colors ${
                    sourceType === 'sample'
                      ? 'border-teal-600 bg-teal-50 text-teal-800'
                      : 'border-slate-200 hover:bg-slate-50 text-slate-600'
                  }`}
                >
                  Bundled Samples
                </button>
                <button
                  type="button"
                  onClick={() => setSourceType('upload')}
                  className={`py-2 px-3 text-xs font-semibold rounded-lg border text-center transition-colors ${
                    sourceType === 'upload'
                      ? 'border-teal-600 bg-teal-50 text-teal-800'
                      : 'border-slate-200 hover:bg-slate-50 text-slate-600'
                  }`}
                >
                  Upload File
                </button>
              </div>
            </div>

            {/* Source Details */}
            {sourceType === 'sample' ? (
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-slate-700">Select Bundled Demonstration Image</label>
                <select
                  value={selectedSample}
                  onChange={(e) => setSelectedSample(e.target.value)}
                  className="w-full text-xs p-2 rounded-lg border border-slate-300 focus:border-teal-600 bg-white"
                >
                  {samples.map((s) => (
                    <option key={s.filename} value={s.filename}>
                      {s.title} ({s.filename})
                    </option>
                  ))}
                </select>
                <span className="text-[11px] text-teal-700 block mt-1">
                  Synthetic test image with known knee intensity gradient.
                </span>
              </div>
            ) : (
              <div className="space-y-2">
                <label className="block text-xs font-medium text-slate-700">Upload Image File (PNG, JPG, BMP)</label>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/jpg,image/bmp,image/tiff"
                  onChange={handleFileChange}
                  className="w-full text-xs text-slate-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-teal-50 file:text-teal-700 hover:file:bg-teal-100"
                />
              </div>
            )}

            {/* Colormap Selector */}
            <div className="space-y-1.5 pt-2 border-t border-slate-100">
              <label className="block text-xs font-medium text-slate-700">OpenCV Colormap</label>
              <select
                value={colormap}
                onChange={(e) => setColormap(e.target.value)}
                className="w-full text-xs p-2 rounded-lg border border-slate-300 focus:border-teal-600 bg-white capitalize"
              >
                <option value="inferno">INFERNO (Recommended Thermal)</option>
                <option value="turbo">TURBO (Smooth Rainbow)</option>
                <option value="jet">JET (Classic Blue-to-Red)</option>
                <option value="plasma">PLASMA</option>
                <option value="viridis">VIRIDIS</option>
                <option value="hot">HOT (Black-Red-Yellow)</option>
                <option value="bone">BONE (Monochrome Thermal)</option>
              </select>
            </div>

            {/* Intensity Display Range */}
            <div className="space-y-2 pt-2 border-t border-slate-100">
              <div className="flex justify-between text-xs text-slate-700">
                <span>Display Window Clipping:</span>
                <span className="font-bold text-teal-700">
                  {minDisplay} — {maxDisplay}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min="0"
                  max="255"
                  value={minDisplay}
                  onChange={(e) => setMinDisplay(Math.min(parseInt(e.target.value), maxDisplay - 1))}
                  className="w-full accent-teal-600"
                />
                <input
                  type="range"
                  min="0"
                  max="255"
                  value={maxDisplay}
                  onChange={(e) => setMaxDisplay(Math.max(parseInt(e.target.value), minDisplay + 1))}
                  className="w-full accent-teal-600"
                />
              </div>
            </div>

            {/* Threshold Percent */}
            <div className="space-y-1 pt-2 border-t border-slate-100">
              <div className="flex justify-between text-xs text-slate-700">
                <span>Intensity Threshold %:</span>
                <span className="font-bold text-teal-700">{thresholdPercent}% of max</span>
              </div>
              <input
                type="range"
                min="10"
                max="95"
                value={thresholdPercent}
                onChange={(e) => setThresholdPercent(parseInt(e.target.value))}
                className="w-full accent-teal-600"
              />
            </div>

            {/* Noise Reduction Toggle */}
            <div className="flex items-center justify-between pt-2 border-t border-slate-100">
              <label htmlFor="noise_reduction" className="text-xs font-medium text-slate-700">
                Gaussian Noise Reduction
              </label>
              <input
                type="checkbox"
                id="noise_reduction"
                checked={noiseReduction}
                onChange={(e) => setNoiseReduction(e.target.checked)}
                className="w-4 h-4 text-teal-600 rounded"
              />
            </div>

            {/* Configurable ROIs */}
            <div className="space-y-3 pt-3 border-t border-slate-100">
              <span className="text-xs font-bold text-slate-800 uppercase tracking-wider block">
                Region-of-Interest Configuration
              </span>

              {/* Left ROI Box */}
              <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 space-y-2 text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-cyan-500"></span>
                  <input
                    type="text"
                    value={leftLabel}
                    onChange={(e) => setLeftLabel(e.target.value)}
                    className="font-semibold text-slate-800 bg-transparent border-b border-dashed border-slate-400 focus:outline-none"
                  />
                </div>
                <div className="grid grid-cols-4 gap-1 text-[11px] text-slate-600">
                  <div>
                    <span>X:</span>
                    <input
                      type="number"
                      value={leftX}
                      onChange={(e) => setLeftX(parseInt(e.target.value) || 0)}
                      className="w-full border rounded p-1"
                    />
                  </div>
                  <div>
                    <span>Y:</span>
                    <input
                      type="number"
                      value={leftY}
                      onChange={(e) => setLeftY(parseInt(e.target.value) || 0)}
                      className="w-full border rounded p-1"
                    />
                  </div>
                  <div>
                    <span>W:</span>
                    <input
                      type="number"
                      value={leftW}
                      onChange={(e) => setLeftW(parseInt(e.target.value) || 10)}
                      className="w-full border rounded p-1"
                    />
                  </div>
                  <div>
                    <span>H:</span>
                    <input
                      type="number"
                      value={leftH}
                      onChange={(e) => setLeftH(parseInt(e.target.value) || 10)}
                      className="w-full border rounded p-1"
                    />
                  </div>
                </div>
              </div>

              {/* Right ROI Box */}
              <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 space-y-2 text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
                  <input
                    type="text"
                    value={rightLabel}
                    onChange={(e) => setRightLabel(e.target.value)}
                    className="font-semibold text-slate-800 bg-transparent border-b border-dashed border-slate-400 focus:outline-none"
                  />
                </div>
                <div className="grid grid-cols-4 gap-1 text-[11px] text-slate-600">
                  <div>
                    <span>X:</span>
                    <input
                      type="number"
                      value={rightX}
                      onChange={(e) => setRightX(parseInt(e.target.value) || 0)}
                      className="w-full border rounded p-1"
                    />
                  </div>
                  <div>
                    <span>Y:</span>
                    <input
                      type="number"
                      value={rightY}
                      onChange={(e) => setRightY(parseInt(e.target.value) || 0)}
                      className="w-full border rounded p-1"
                    />
                  </div>
                  <div>
                    <span>W:</span>
                    <input
                      type="number"
                      value={rightW}
                      onChange={(e) => setRightW(parseInt(e.target.value) || 10)}
                      className="w-full border rounded p-1"
                    />
                  </div>
                  <div>
                    <span>H:</span>
                    <input
                      type="number"
                      value={rightH}
                      onChange={(e) => setRightH(parseInt(e.target.value) || 10)}
                      className="w-full border rounded p-1"
                    />
                  </div>
                </div>
              </div>
            </div>

            <button
              onClick={handleAnalyze}
              disabled={isProcessing}
              className="w-full bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs py-2.5 rounded-lg shadow-sm flex items-center justify-center gap-2 transition-colors disabled:opacity-60"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isProcessing ? 'animate-spin' : ''}`} />
              <span>{isProcessing ? 'Processing via Python...' : 'Execute OpenCV Thermal Analysis'}</span>
            </button>
          </div>

          {/* Visualization & Statistical Results Column */}
          <div className="lg:col-span-2 space-y-6">
            {/* Side-by-Side Image Visualizer */}
            <div className="healthcare-card p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Visual Comparison (Original vs Processed False-Color)
                </h3>
                {analysisResult && (
                  <span className="text-[11px] font-mono text-slate-400">
                    {analysisResult.width} × {analysisResult.height} px
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Original Image */}
                <div className="space-y-1.5">
                  <span className="text-xs font-semibold text-slate-700 block">Original Source Image</span>
                  <div className="bg-slate-900 rounded-xl overflow-hidden aspect-4/3 flex items-center justify-center border border-slate-200">
                    {analysisResult?.original_image_ref ? (
                      <img
                        src={analysisResult.original_image_ref}
                        alt="Original thermal input"
                        className="w-full h-full object-contain"
                      />
                    ) : sourceType === 'sample' ? (
                      <img
                        src={`/api/images/samples/${selectedSample}`}
                        alt="Selected sample preview"
                        className="w-full h-full object-contain"
                      />
                    ) : uploadPreviewUrl ? (
                      <img
                        src={uploadPreviewUrl}
                        alt="Uploaded preview"
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <div className="text-xs text-slate-400">Select an image to preview</div>
                    )}
                  </div>
                </div>

                {/* Processed False-Color Image */}
                <div className="space-y-1.5">
                  <span className="text-xs font-semibold text-slate-700 block">
                    Processed Heatmap ({colormap.toUpperCase()} + ROIs)
                  </span>
                  <div className="bg-slate-900 rounded-xl overflow-hidden aspect-4/3 flex items-center justify-center border border-slate-200">
                    {analysisResult?.processed_image_ref ? (
                      <img
                        src={analysisResult.processed_image_ref}
                        alt="Processed false-color heatmap"
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <div className="text-center p-6 text-slate-400">
                        <Flame className="w-8 h-8 mx-auto mb-2 text-slate-600" />
                        <span className="text-xs">Click "Execute OpenCV Thermal Analysis" to generate processed matrix</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Regional Statistical Comparison Card */}
            {analysisResult?.regional_comparison && (
              <div className="healthcare-card p-5 space-y-3 bg-teal-50/40 border-teal-200">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-teal-800">
                    Bilateral Regional Asymmetry
                  </span>
                  <span className="text-xs font-bold text-teal-700">
                    Higher in {analysisResult.regional_comparison.higher_intensity_roi}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-1">
                  <div className="p-3 bg-white rounded-lg border border-teal-200">
                    <span className="text-[11px] text-slate-500 block">Absolute Mean Difference</span>
                    <span className="text-lg font-bold text-slate-900">
                      {analysisResult.regional_comparison.absolute_difference} units
                    </span>
                  </div>
                  <div className="p-3 bg-white rounded-lg border border-teal-200">
                    <span className="text-[11px] text-slate-500 block">Signed Difference</span>
                    <span className="text-lg font-bold text-slate-900">
                      {analysisResult.regional_comparison.signed_difference > 0 ? '+' : ''}
                      {analysisResult.regional_comparison.signed_difference} units
                    </span>
                  </div>
                  <div className="p-3 bg-white rounded-lg border border-teal-200">
                    <span className="text-[11px] text-slate-500 block">Relative % Difference</span>
                    <span className="text-lg font-bold text-slate-900">
                      {analysisResult.regional_comparison.relative_percent_difference !== null
                        ? `${analysisResult.regional_comparison.relative_percent_difference}%`
                        : 'N/A'}
                    </span>
                  </div>
                </div>

                <p className="text-xs text-slate-600 italic">
                  {analysisResult.regional_comparison.interpretation}
                </p>
              </div>
            )}

            {/* ROI Metrics Table */}
            {analysisResult?.roi_statistics && analysisResult.roi_statistics.length > 0 && (
              <div className="healthcare-card p-5 space-y-4">
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Calculated ROI Statistical Metrics
                </h3>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-500 uppercase text-[11px]">
                        <th className="pb-2 font-medium">Region Label</th>
                        <th className="pb-2 font-medium">Mean Intensity</th>
                        <th className="pb-2 font-medium">Median</th>
                        <th className="pb-2 font-medium">Min / Max</th>
                        <th className="pb-2 font-medium">Std Dev</th>
                        <th className="pb-2 font-medium">% &gt; Threshold</th>
                        <th className="pb-2 font-medium">Pixels</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {analysisResult.roi_statistics.map((roi) => (
                        <tr key={roi.label} className="hover:bg-slate-50/80">
                          <td className="py-2.5 font-semibold text-slate-800 flex items-center gap-2">
                            <span
                              className={`w-2 h-2 rounded-full ${
                                roi.label.toLowerCase().includes('left') ? 'bg-cyan-500' : 'bg-amber-500'
                              }`}
                            ></span>
                            <span>{roi.label}</span>
                          </td>
                          <td className="py-2.5 font-bold text-slate-900">{roi.mean_intensity}</td>
                          <td className="py-2.5 text-slate-600">{roi.median_intensity}</td>
                          <td className="py-2.5 text-slate-600">
                            {roi.min_intensity} / {roi.max_intensity}
                          </td>
                          <td className="py-2.5 text-slate-600">±{roi.std_intensity}</td>
                          <td className="py-2.5 font-semibold text-teal-700">{roi.percent_above_threshold}%</td>
                          <td className="py-2.5 text-slate-500 font-mono">{roi.pixel_count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Intensity Histogram Sparklines */}
                <div className="pt-2">
                  <span className="text-xs font-semibold text-slate-700 block mb-2">
                    16-Bin Intensity Distribution Histograms
                  </span>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {analysisResult.roi_statistics.map((roi) => {
                      const histData = roi.histogram.map((count, idx) => ({
                        bin: `${idx * 16}`,
                        count,
                      }));
                      return (
                        <div key={roi.label} className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                          <span className="text-[11px] font-bold text-slate-700 block mb-1">{roi.label}</span>
                          <div className="h-24 w-full">
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart data={histData}>
                                <Tooltip
                                  contentStyle={{ fontSize: '10px', padding: '4px' }}
                                  formatter={(val) => [`${val} px`, 'Pixels']}
                                />
                                <Bar dataKey="count" fill="#0d9488" radius={[2, 2, 0, 0]} />
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: PRE/POST EXERCISE COMPARISON */}
      {activeTab === 'pre_post' && (
        <div className="space-y-6">
          <div className="healthcare-card p-6 space-y-4">
            <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
              Pre-Exercise vs Post-Exercise Bilateral Thermal Delta Analysis
            </h2>
            <p className="text-xs text-slate-500">
              Evaluates physiological thermal gradients across regions of interest before and after exertion.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Pre-Exercise Image</label>
                <select
                  value={preImageSample}
                  onChange={(e) => setPreImageSample(e.target.value)}
                  className="w-full text-xs p-2 rounded-lg border border-slate-300 bg-white"
                >
                  <option value="sample_knees_pre_exercise.png">Pre-Exercise Bilateral Knee (sample_knees_pre_exercise.png)</option>
                  <option value="sample_knees_resting.png">Bilateral Knee Resting Baseline (sample_knees_resting.png)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Post-Exercise Image</label>
                <select
                  value={postImageSample}
                  onChange={(e) => setPostImageSample(e.target.value)}
                  className="w-full text-xs p-2 rounded-lg border border-slate-300 bg-white"
                >
                  <option value="sample_knees_post_exercise.png">Post-Exercise Bilateral Knee (sample_knees_post_exercise.png)</option>
                  <option value="sample_asymmetric_knee.png">Asymmetric Knee Exertion (sample_asymmetric_knee.png)</option>
                </select>
              </div>
            </div>

            <button
              onClick={handlePrePostCompare}
              disabled={isComparing}
              className="bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs px-5 py-2.5 rounded-lg shadow-sm flex items-center gap-2 transition-colors disabled:opacity-60"
            >
              <GitCompare className="w-4 h-4" />
              <span>{isComparing ? 'Comparing Images...' : 'Run Pre/Post Comparison Pipeline'}</span>
            </button>
          </div>

          {/* Pre/Post Results Visualization */}
          {prePostResult && (
            <div className="healthcare-card p-6 space-y-6">
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                Composite Pre- vs Post-Exercise Visualization
              </h3>

              {prePostResult.side_by_side_processed_ref && (
                <div className="bg-slate-900 rounded-xl overflow-hidden aspect-2/1 flex items-center justify-center border border-slate-200">
                  <img
                    src={prePostResult.side_by_side_processed_ref}
                    alt="Pre-post composite"
                    className="w-full h-full object-contain"
                  />
                </div>
              )}

              {/* Deltas Table */}
              {prePostResult.roi_deltas && (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-500 uppercase text-[11px]">
                        <th className="pb-2 font-medium">ROI Region</th>
                        <th className="pb-2 font-medium">Pre-Exercise Mean</th>
                        <th className="pb-2 font-medium">Post-Exercise Mean</th>
                        <th className="pb-2 font-medium">Mean Intensity Change</th>
                        <th className="pb-2 font-medium">Max Intensity Change</th>
                        <th className="pb-2 font-medium">% &gt; Threshold Change</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {prePostResult.roi_deltas.map((d: any) => (
                        <tr key={d.label}>
                          <td className="py-2.5 font-bold text-slate-800">{d.label}</td>
                          <td className="py-2.5 text-slate-600">{d.pre_mean_intensity}</td>
                          <td className="py-2.5 text-slate-600">{d.post_mean_intensity}</td>
                          <td className="py-2.5 font-bold">
                            <span className={d.mean_intensity_delta >= 0 ? 'text-amber-600' : 'text-teal-700'}>
                              {d.mean_intensity_delta >= 0 ? `+${d.mean_intensity_delta}` : d.mean_intensity_delta} units
                            </span>
                          </td>
                          <td className="py-2.5 text-slate-700 font-semibold">
                            {d.max_intensity_delta >= 0 ? `+${d.max_intensity_delta}` : d.max_intensity_delta} units
                          </td>
                          <td className="py-2.5 text-slate-700 font-semibold">
                            {d.percent_above_threshold_delta >= 0
                              ? `+${d.percent_above_threshold_delta}%`
                              : `${d.percent_above_threshold_delta}%`}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <p className="text-xs text-slate-600 italic bg-slate-50 p-3 rounded-lg border border-slate-200">
                {prePostResult.summary_interpretation}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
