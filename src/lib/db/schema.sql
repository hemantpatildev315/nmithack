-- ==============================================================================
-- Production TiDB / MySQL Schema DDL
-- AI-Evaluation Benchmark Platform
-- Optimized for Distributed SQL, clustered indexes, and high-frequency writes.
-- ==============================================================================

CREATE TABLE IF NOT EXISTS benchmark_runs (
    id VARCHAR(64) NOT NULL PRIMARY KEY,
    model VARCHAR(128) NOT NULL,
    status ENUM('pending', 'running', 'completed', 'failed') NOT NULL DEFAULT 'pending',
    total_cases INT UNSIGNED NOT NULL DEFAULT 0,
    passed_cases INT UNSIGNED NOT NULL DEFAULT 0,
    failed_cases INT UNSIGNED NOT NULL DEFAULT 0,
    average_score DECIMAL(5, 4) NOT NULL DEFAULT 0.0000,
    average_latency_ms INT UNSIGNED NOT NULL DEFAULT 0,
    duration_ms INT UNSIGNED NOT NULL DEFAULT 0,
    is_mock BOOLEAN NOT NULL DEFAULT FALSE,
    metadata JSON NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    INDEX idx_model_created (model, created_at),
    INDEX idx_status_created (status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS test_case_results (
    id VARCHAR(64) NOT NULL PRIMARY KEY,
    run_id VARCHAR(64) NOT NULL,
    test_case_id VARCHAR(128) NOT NULL,
    input TEXT NOT NULL,
    expected_output TEXT NULL,
    actual_output MEDIUMTEXT NOT NULL,
    latency_ms INT UNSIGNED NOT NULL,
    prompt_tokens INT UNSIGNED NOT NULL DEFAULT 0,
    completion_tokens INT UNSIGNED NOT NULL DEFAULT 0,
    total_tokens INT UNSIGNED NOT NULL DEFAULT 0,
    overall_score DECIMAL(5, 4) NOT NULL,
    passed BOOLEAN NOT NULL,
    is_mock BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    CONSTRAINT fk_test_cases_run FOREIGN KEY (run_id) REFERENCES benchmark_runs(id) ON DELETE CASCADE,
    INDEX idx_run_id (run_id),
    INDEX idx_test_case_id (test_case_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS metric_scores (
    id VARCHAR(64) NOT NULL PRIMARY KEY,
    test_case_result_id VARCHAR(64) NOT NULL,
    metric VARCHAR(64) NOT NULL,
    score DECIMAL(5, 4) NOT NULL,
    passed BOOLEAN NOT NULL,
    reasoning TEXT NOT NULL,
    details JSON NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    CONSTRAINT fk_metrics_test_case FOREIGN KEY (test_case_result_id) REFERENCES test_case_results(id) ON DELETE CASCADE,
    INDEX idx_case_result (test_case_result_id),
    INDEX idx_metric_score (metric, score)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
