/**
 * Rate limiting and batch processing configuration
 */
export const RATE_LIMIT_CONFIG = {
  /**
   * Batch size: number of candidate keywords to compare at once
   * Google Trends supports up to 5 keywords total (1 base + 4 candidates)
   */
  batchSize: 4,

  /**
   * Token bucket configuration for rate limiting
   */
  tokenBucket: {
    capacity: 5, // Maximum tokens in bucket
    refillRate: 1.5, // Tokens generated per second (increased from 1.0 due to batch processing)
  },

  /**
   * Exponential backoff retry configuration
   */
  retry: {
    maxRetries: 3, // Maximum retry attempts
    initialDelay: 1000, // Initial delay in milliseconds
    jitterPercent: 0.25, // Random jitter (±25%)
  },

  /**
   * Circuit breaker configuration
   */
  circuitBreaker: {
    failureThreshold: 5, // Consecutive failures to trigger circuit open
    resetTimeout: 60000, // Time in ms before attempting recovery (60s)
  },

  /**
   * Adaptive rate adjustment configuration (AIMD)
   */
  adaptive: {
    minInterval: 500, // Minimum interval between requests (ms)
    maxInterval: 10000, // Maximum interval between requests (ms)
    initialInterval: 2000, // Starting interval (ms)
    increaseStep: 100, // Decrease interval by this amount after success
    decreaseFactor: 2, // Multiply interval by this factor after 429
  },
}

export type RateLimitConfig = typeof RATE_LIMIT_CONFIG
