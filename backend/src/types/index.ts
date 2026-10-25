export interface User {
  UserId: string;
  Name: string;
  Email: string;
  PasswordHash: string;
  Role: string;
  CreatedAt: string;
  UpdatedAt: string;
}

export interface UserResponse {
  userId: string;
  name: string;
  email: string;
  role: string;
}

export interface ExerciseSession {
  SessionId: string;
  UserId: string;
  ExerciseType: string;
  TrackingMode: 'automatic_pose' | 'manual';
  SessionStatus: 'in_progress' | 'completed' | 'abandoned';
  StartedAt: string;
  CompletedAt?: string;
  DurationSeconds: number;
  TargetRepetitions: number;
  CompletedRepetitions: number;
  TargetSets: number;
  CompletedSets: number;
  MinimumKneeAngle?: number;
  MaximumKneeAngle?: number;
  EstimatedRangeOfMotion?: number;
  PeakAngleVariability?: number;
  TargetAngleReachedPercentage?: number;
  PainRating?: number;
  SorenessRating?: number;
  FatigueRating?: number;
  Notes?: string;
  IsDemo: boolean;
  CreatedAt: string;
}

export interface ThermalAnalysisRecord {
  ThermalAnalysisId: string;
  SessionId?: string;
  UserId: string;
  ImageSource: string;
  AnalysisType: string;
  OriginalImageReference: string;
  ProcessedImageReference: string;
  SecondaryImageReference?: string;
  MeasurementType: string;
  TemperatureAvailable: boolean;
  ProcessingConfiguration: string;
  AnalysisResultsJson: string;
  IsDemo: boolean;
  CreatedAt: string;
}

export interface BaselineRecord {
  BaselineId: string;
  UserId: string;
  ExerciseType: string;
  SourceSessionId: string;
  BaselineMetricsJson: string;
  IsActive: boolean;
  CreatedAt: string;
}

export interface SessionComparisonRecord {
  ComparisonId: string;
  SessionId: string;
  BaselineId: string;
  ComparisonResultsJson: string;
  CreatedAt: string;
}

export interface ExerciseEventRecord {
  ExerciseEventId: string;
  SessionId: string;
  EventType: string;
  EventTimestamp: string;
  KneeAngle?: number;
  LandmarkConfidence?: number;
  EventMetadataJson?: string;
}
