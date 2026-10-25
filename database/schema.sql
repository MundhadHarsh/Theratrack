-- TheraTrack Database Schema for Microsoft SQL Server
-- Database: TheraTrackDb

IF NOT EXISTS (SELECT * FROM sys.databases WHERE name = 'TheraTrackDb')
BEGIN
    CREATE DATABASE TheraTrackDb;
END
GO

USE TheraTrackDb;
GO

-- 1. Users Table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Users')
BEGIN
    CREATE TABLE Users (
        UserId NVARCHAR(50) NOT NULL PRIMARY KEY,
        Name NVARCHAR(100) NOT NULL,
        Email NVARCHAR(255) NOT NULL UNIQUE,
        PasswordHash NVARCHAR(255) NOT NULL,
        Role NVARCHAR(50) NOT NULL DEFAULT 'patient',
        CreatedAt DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET(),
        UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET()
    );

    CREATE NONCLUSTERED INDEX IX_Users_Email ON Users(Email);
END
GO

-- 2. ExerciseSessions Table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'ExerciseSessions')
BEGIN
    CREATE TABLE ExerciseSessions (
        SessionId NVARCHAR(50) NOT NULL PRIMARY KEY,
        UserId NVARCHAR(50) NOT NULL FOREIGN KEY REFERENCES Users(UserId) ON DELETE CASCADE,
        ExerciseType NVARCHAR(100) NOT NULL,
        TrackingMode NVARCHAR(50) NOT NULL, -- 'automatic_pose' | 'manual'
        SessionStatus NVARCHAR(50) NOT NULL, -- 'in_progress' | 'completed' | 'abandoned'
        StartedAt DATETIMEOFFSET NOT NULL,
        CompletedAt DATETIMEOFFSET NULL,
        DurationSeconds INT NOT NULL DEFAULT 0,
        TargetRepetitions INT NOT NULL DEFAULT 10,
        CompletedRepetitions INT NOT NULL DEFAULT 0,
        TargetSets INT NOT NULL DEFAULT 1,
        CompletedSets INT NOT NULL DEFAULT 1,
        MinimumKneeAngle FLOAT NULL,
        MaximumKneeAngle FLOAT NULL,
        EstimatedRangeOfMotion FLOAT NULL,
        PeakAngleVariability FLOAT NULL,
        TargetAngleReachedPercentage FLOAT NULL,
        PainRating INT NULL CHECK (PainRating >= 0 AND PainRating <= 10),
        SorenessRating INT NULL CHECK (SorenessRating >= 0 AND SorenessRating <= 10),
        FatigueRating INT NULL CHECK (FatigueRating >= 0 AND FatigueRating <= 10),
        Notes NVARCHAR(MAX) NULL,
        IsDemo BIT NOT NULL DEFAULT 0,
        CreatedAt DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET()
    );

    CREATE NONCLUSTERED INDEX IX_ExerciseSessions_UserId ON ExerciseSessions(UserId);
    CREATE NONCLUSTERED INDEX IX_ExerciseSessions_CreatedAt ON ExerciseSessions(CreatedAt DESC);
END
GO

-- 3. ThermalAnalyses Table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'ThermalAnalyses')
BEGIN
    CREATE TABLE ThermalAnalyses (
        ThermalAnalysisId NVARCHAR(50) NOT NULL PRIMARY KEY,
        SessionId NVARCHAR(50) NULL FOREIGN KEY REFERENCES ExerciseSessions(SessionId) ON DELETE SET NULL,
        UserId NVARCHAR(50) NOT NULL FOREIGN KEY REFERENCES Users(UserId),
        ImageSource NVARCHAR(50) NOT NULL, -- 'upload' | 'sample' | 'webcam_capture'
        AnalysisType NVARCHAR(50) NOT NULL DEFAULT 'single', -- 'single' | 'pre_post_comparison'
        OriginalImageReference NVARCHAR(500) NOT NULL,
        ProcessedImageReference NVARCHAR(500) NOT NULL,
        SecondaryImageReference NVARCHAR(500) NULL,
        MeasurementType NVARCHAR(100) NOT NULL, -- 'image_intensity' | 'calibrated_temperature'
        TemperatureAvailable BIT NOT NULL DEFAULT 0,
        ProcessingConfiguration NVARCHAR(MAX) NOT NULL,
        AnalysisResultsJson NVARCHAR(MAX) NOT NULL,
        IsDemo BIT NOT NULL DEFAULT 0,
        CreatedAt DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET()
    );

    CREATE NONCLUSTERED INDEX IX_ThermalAnalyses_UserId ON ThermalAnalyses(UserId);
    CREATE NONCLUSTERED INDEX IX_ThermalAnalyses_SessionId ON ThermalAnalyses(SessionId);
END
GO

-- 4. Baselines Table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Baselines')
BEGIN
    CREATE TABLE Baselines (
        BaselineId NVARCHAR(50) NOT NULL PRIMARY KEY,
        UserId NVARCHAR(50) NOT NULL FOREIGN KEY REFERENCES Users(UserId) ON DELETE CASCADE,
        ExerciseType NVARCHAR(100) NOT NULL,
        SourceSessionId NVARCHAR(50) NOT NULL FOREIGN KEY REFERENCES ExerciseSessions(SessionId),
        BaselineMetricsJson NVARCHAR(MAX) NOT NULL,
        IsActive BIT NOT NULL DEFAULT 1,
        CreatedAt DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET()
    );

    CREATE NONCLUSTERED INDEX IX_Baselines_User_Exercise ON Baselines(UserId, ExerciseType);
END
GO

-- 5. SessionComparisons Table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'SessionComparisons')
BEGIN
    CREATE TABLE SessionComparisons (
        ComparisonId NVARCHAR(50) NOT NULL PRIMARY KEY,
        SessionId NVARCHAR(50) NOT NULL FOREIGN KEY REFERENCES ExerciseSessions(SessionId) ON DELETE CASCADE,
        BaselineId NVARCHAR(50) NOT NULL FOREIGN KEY REFERENCES Baselines(BaselineId),
        ComparisonResultsJson NVARCHAR(MAX) NOT NULL,
        CreatedAt DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET()
    );

    CREATE NONCLUSTERED INDEX IX_SessionComparisons_SessionId ON SessionComparisons(SessionId);
END
GO

-- 6. ExerciseEvents Table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'ExerciseEvents')
BEGIN
    CREATE TABLE ExerciseEvents (
        ExerciseEventId NVARCHAR(50) NOT NULL PRIMARY KEY,
        SessionId NVARCHAR(50) NOT NULL FOREIGN KEY REFERENCES ExerciseSessions(SessionId) ON DELETE CASCADE,
        EventType NVARCHAR(50) NOT NULL, -- 'rep_completed' | 'phase_change' | 'target_reached' | 'paused' | 'resumed'
        EventTimestamp DATETIMEOFFSET NOT NULL,
        KneeAngle FLOAT NULL,
        LandmarkConfidence FLOAT NULL,
        EventMetadataJson NVARCHAR(MAX) NULL
    );

    CREATE NONCLUSTERED INDEX IX_ExerciseEvents_SessionId ON ExerciseEvents(SessionId);
END
GO
