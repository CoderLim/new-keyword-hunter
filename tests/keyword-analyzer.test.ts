import test from "node:test"
import assert from "node:assert/strict"

import {
  parseTimelineSeriesValues,
  parseTimelineResponse,
  isNewWordEffectiveByBase
} from "../src/lib/keyword-analyzer.js"

test("parseTimelineSeriesValues returns multi-series values from timelineData", () => {
  const response = `)]}',\n${JSON.stringify({
    default: {
      timelineData: [
        { time: "1", value: [10, 0] },
        { time: "2", value: [20, 5] },
        { time: "3", value: [30, "<1"] }
      ]
    }
  })}`

  const series = parseTimelineSeriesValues(response)

  assert.deepEqual(series, [
    [10, 20, 30],
    [0, 5, 0]
  ])
})

test("parseTimelineResponse reads first series from array values", () => {
  const response = `)]}',\n${JSON.stringify({
    default: {
      timelineData: [
        { time: "1", value: [0, 9] },
        { time: "2", value: [15, 6] }
      ]
    }
  })}`

  const points = parseTimelineResponse(response)

  assert.equal(points.length, 2)
  assert.equal(points[0].value, 0)
  assert.equal(points[1].value, 15)
})

test("isNewWordEffectiveByBase returns true when candidate meets base-relative threshold", () => {
  const candidateTimeline = [0, 0, 0, 0, 0, 20, 20, 20, 20, 20]
  const baseTimeline = [10, 10, 10, 10, 10, 50, 50, 50, 50, 50]

  assert.equal(
    isNewWordEffectiveByBase(candidateTimeline, baseTimeline, 30),
    true
  )
})

test("isNewWordEffectiveByBase returns false when first points are non-zero", () => {
  const candidateTimeline = [1, 0, 0, 0, 0, 20, 20, 20, 20, 20]
  const baseTimeline = [10, 10, 10, 10, 10, 50, 50, 50, 50, 50]

  assert.equal(
    isNewWordEffectiveByBase(candidateTimeline, baseTimeline, 30),
    false
  )
})

test("isNewWordEffectiveByBase returns false when base series has zero average", () => {
  const candidateTimeline = [0, 0, 0, 0, 0, 20, 20, 20, 20, 20]
  const baseTimeline = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]

  assert.equal(
    isNewWordEffectiveByBase(candidateTimeline, baseTimeline, 30),
    false
  )
})
