-- Migration: Add missing columns for batch processing compatibility
-- This ensures the BatchProcessingService can work with the existing batch_reports table

-- Add missing columns to batch_reports table if they don't exist
DO $$
BEGIN
    -- Add analysis_type column if it doesn't exist (for backward compatibility)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'batch_reports' AND column_name = 'analysis_type') THEN
        ALTER TABLE batch_reports ADD COLUMN analysis_type VARCHAR(50) DEFAULT 'standard';
    END IF;

    -- Add analysis_result column if it doesn't exist (for backward compatibility)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'batch_reports' AND column_name = 'analysis_result') THEN
        ALTER TABLE batch_reports ADD COLUMN analysis_result JSONB;
    END IF;
END $$;

-- Update existing batch_reports to have proper analysis_type values
UPDATE batch_reports SET analysis_type = 'standard' WHERE analysis_type IS NULL;

-- Make sure the screenshots table has all required columns
DO $$
BEGIN
    -- Add ai_analysis_completed column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'screenshots' AND column_name = 'ai_analysis_completed') THEN
        ALTER TABLE screenshots ADD COLUMN ai_analysis_completed BOOLEAN DEFAULT FALSE;
    END IF;

    -- Add processed_at column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'screenshots' AND column_name = 'processed_at') THEN
        ALTER TABLE screenshots ADD COLUMN processed_at TIMESTAMPTZ;
    END IF;

    -- Update the batch_report_id foreign key to reference the correct table
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'screenshots' AND column_name = 'batch_report_id') THEN
        -- Drop the existing constraint if it exists and points to wrong table
        IF EXISTS (SELECT 1 FROM information_schema.table_constraints tc
                   JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
                   WHERE tc.table_name = 'screenshots' AND kcu.column_name = 'batch_report_id' AND tc.constraint_type = 'FOREIGN KEY') THEN

            -- Get the constraint name and drop it
            DECLARE constraint_name_var TEXT;
            BEGIN
                SELECT tc.constraint_name INTO constraint_name_var
                FROM information_schema.table_constraints tc
                JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
                WHERE tc.table_name = 'screenshots' AND kcu.column_name = 'batch_report_id' AND tc.constraint_type = 'FOREIGN KEY'
                LIMIT 1;

                IF constraint_name_var IS NOT NULL THEN
                    EXECUTE 'ALTER TABLE screenshots DROP CONSTRAINT ' || constraint_name_var;
                END IF;
            END;
        END IF;

        -- Add the correct foreign key constraint
        ALTER TABLE screenshots ADD CONSTRAINT screenshots_batch_report_id_fkey
            FOREIGN KEY (batch_report_id) REFERENCES batch_reports(id) ON DELETE SET NULL;
    ELSE
        -- Add the column if it doesn't exist
        ALTER TABLE screenshots ADD COLUMN batch_report_id UUID REFERENCES batch_reports(id) ON DELETE SET NULL;
    END IF;

    -- Add ocr_text column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'screenshots' AND column_name = 'ocr_text') THEN
        ALTER TABLE screenshots ADD COLUMN ocr_text TEXT;
    END IF;

    -- Add retention_expires_at column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'screenshots' AND column_name = 'retention_expires_at') THEN
        ALTER TABLE screenshots ADD COLUMN retention_expires_at TIMESTAMPTZ;
    END IF;
END $$;

-- Create indexes for performance if they don't exist
CREATE INDEX IF NOT EXISTS idx_batch_reports_analysis_type ON batch_reports(analysis_type);
CREATE INDEX IF NOT EXISTS idx_screenshots_ai_analysis_completed ON screenshots(ai_analysis_completed);
CREATE INDEX IF NOT EXISTS idx_screenshots_batch_report_id ON screenshots(batch_report_id);
CREATE INDEX IF NOT EXISTS idx_screenshots_processed_at ON screenshots(processed_at);

-- Add comments for documentation
COMMENT ON COLUMN batch_reports.analysis_type IS 'Type of AI analysis performed (standard, detailed, etc.)';
COMMENT ON COLUMN batch_reports.analysis_result IS 'Legacy analysis result storage for backward compatibility';
COMMENT ON COLUMN screenshots.ai_analysis_completed IS 'Whether AI analysis has been completed for this screenshot';
COMMENT ON COLUMN screenshots.processed_at IS 'When this screenshot was processed by batch analysis';
COMMENT ON COLUMN screenshots.batch_report_id IS 'References the batch report that processed this screenshot';
COMMENT ON COLUMN screenshots.ocr_text IS 'Extracted text from OCR analysis';
COMMENT ON COLUMN screenshots.retention_expires_at IS 'When this screenshot should be automatically deleted';