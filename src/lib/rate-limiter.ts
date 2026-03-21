import { RATE_LIMIT_CONFIG } from "~config"

/**
 * Sleep utility
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Token Bucket Rate Limiter
 * Allows burst traffic while maintaining average rate control
 */
export class TokenBucket {
  private tokens: number
  private lastRefill: number
  private readonly capacity: number
  private readonly refillRate: number

  constructor(capacity?: number, refillRate?: number) {
    this.capacity = capacity ?? RATE_LIMIT_CONFIG.tokenBucket.capacity
    this.refillRate = refillRate ?? RATE_LIMIT_CONFIG.tokenBucket.refillRate
    this.tokens = this.capacity
    this.lastRefill = Date.now()
  }

  /**
   * Acquire a token, waiting if necessary
   */
  async acquire(): Promise<void> {
    await this.refill()

    while (this.tokens < 1) {
      await sleep(100)
      await this.refill()
    }

    this.tokens -= 1
  }

  /**
   * Refill tokens based on elapsed time
   */
  private async refill(): Promise<void> {
    const now = Date.now()
    const elapsed = (now - this.lastRefill) / 1000
    const newTokens = elapsed * this.refillRate

    this.tokens = Math.min(this.capacity, this.tokens + newTokens)
    this.lastRefill = now
  }

  /**
   * Get current token count
   */
  getTokens(): number {
    return this.tokens
  }

  /**
   * Update rate parameters
   */
  updateRate(capacity: number, refillRate: number): void {
    this.capacity = capacity
    this.refillRate = refillRate
  }
}

/**
 * Exponential Backoff with Jitter for retry logic
 */
export async function fetchWithRetry(
  url: string,
  options: RequestInit = {},
  maxRetries: number = RATE_LIMIT_CONFIG.retry.maxRetries
): Promise<Response> {
  let lastError: Error | null = null

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, options)

      if (response.status === 429) {
        if (attempt === maxRetries) {
          throw new Error(`Rate limited after ${maxRetries} retries`)
        }

        // Check for Retry-After header
        const retryAfter = response.headers.get("Retry-After")
        let delay: number

        if (retryAfter) {
          // Respect Retry-After if provided
          delay = parseInt(retryAfter, 10) * 1000
        } else {
          // Exponential backoff: 2^attempt * 1000ms
          const baseDelay = Math.pow(2, attempt) * RATE_LIMIT_CONFIG.retry.initialDelay
          // Add jitter: ±25% random offset
          const jitter =
            baseDelay * RATE_LIMIT_CONFIG.retry.jitterPercent * (Math.random() * 2 - 1)
          delay = baseDelay + jitter
        }

        console.log(`[NKH] 429 detected, retry ${attempt + 1}/${maxRetries} after ${delay}ms`)
        await sleep(delay)
        continue
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      return response
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))

      if (attempt === maxRetries) {
        break
      }

      // Network errors also get retry with shorter delay
      const delay = Math.pow(1.5, attempt) * 500
      await sleep(delay)
    }
  }

  throw lastError || new Error("Unknown error in fetchWithRetry")
}

/**
 * Circuit Breaker Pattern
 * Prevents cascading failures by stopping requests after repeated failures
 */
export enum CircuitState {
  CLOSED = "CLOSED", // Normal operation
  OPEN = "OPEN", // Blocking requests
  HALF_OPEN = "HALF_OPEN", // Testing recovery
}

export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED
  private failureCount: number = 0
  private lastFailureTime: number = 0
  private readonly failureThreshold: number
  private readonly resetTimeout: number

  constructor(failureThreshold?: number, resetTimeout?: number) {
    this.failureThreshold =
      failureThreshold ?? RATE_LIMIT_CONFIG.circuitBreaker.failureThreshold
    this.resetTimeout = resetTimeout ?? RATE_LIMIT_CONFIG.circuitBreaker.resetTimeout
  }

  /**
   * Execute a function with circuit breaker protection
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === CircuitState.OPEN) {
      if (Date.now() - this.lastFailureTime > this.resetTimeout) {
        console.log("[NKH] Circuit breaker: entering HALF_OPEN state")
        this.state = CircuitState.HALF_OPEN
      } else {
        throw new Error("Circuit breaker is OPEN, request rejected")
      }
    }

    try {
      const result = await fn()
      this.onSuccess()
      return result
    } catch (error) {
      this.onFailure()
      throw error
    }
  }

  private onSuccess(): void {
    this.failureCount = 0

    if (this.state === CircuitState.HALF_OPEN) {
      console.log("[NKH] Circuit breaker: back to CLOSED")
      this.state = CircuitState.CLOSED
    }
  }

  private onFailure(): void {
    this.failureCount++
    this.lastFailureTime = Date.now()

    if (this.failureCount >= this.failureThreshold) {
      console.log("[NKH] Circuit breaker: OPEN due to repeated failures")
      this.state = CircuitState.OPEN
    }
  }

  /**
   * Get current circuit state
   */
  getState(): CircuitState {
    return this.state
  }

  /**
   * Reset circuit breaker
   */
  reset(): void {
    this.state = CircuitState.CLOSED
    this.failureCount = 0
    this.lastFailureTime = 0
  }
}

/**
 * Adaptive Rate Limiter using AIMD (Additive Increase Multiplicative Decrease)
 * Automatically adjusts request interval based on success/failure
 */
export class AdaptiveRateLimiter {
  private requestInterval: number
  private readonly minInterval: number
  private readonly maxInterval: number
  private successCount: number = 0
  private readonly increaseStep: number
  private readonly decreaseFactor: number

  constructor() {
    const config = RATE_LIMIT_CONFIG.adaptive
    this.requestInterval = config.initialInterval
    this.minInterval = config.minInterval
    this.maxInterval = config.maxInterval
    this.increaseStep = config.increaseStep
    this.decreaseFactor = config.decreaseFactor
  }

  /**
   * Wait for the current interval
   */
  async acquire(): Promise<void> {
    await sleep(this.requestInterval)
  }

  /**
   * Called after successful request
   * Gradually increases speed (decreases interval)
   */
  onSuccess(): void {
    this.successCount++

    // Every 10 successes, decrease interval by increaseStep
    if (this.successCount >= 10) {
      const oldInterval = this.requestInterval
      this.requestInterval = Math.max(this.minInterval, this.requestInterval - this.increaseStep)
      this.successCount = 0

      if (oldInterval !== this.requestInterval) {
        console.log(`[NKH] Speed up: interval ${oldInterval}ms → ${this.requestInterval}ms`)
      }
    }
  }

  /**
   * Called after 429 error
   * Immediately slows down (increases interval)
   */
  on429(): void {
    const oldInterval = this.requestInterval
    this.requestInterval = Math.min(this.maxInterval, this.requestInterval * this.decreaseFactor)
    this.successCount = 0

    console.log(`[NKH] Rate limited! Slow down: interval ${oldInterval}ms → ${this.requestInterval}ms`)
  }

  /**
   * Get current interval
   */
  getInterval(): number {
    return this.requestInterval
  }

  /**
   * Set interval manually
   */
  setInterval(interval: number): void {
    this.requestInterval = Math.max(this.minInterval, Math.min(this.maxInterval, interval))
  }
}
