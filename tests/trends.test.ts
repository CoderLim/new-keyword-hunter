import test from "node:test"
import assert from "node:assert/strict"

import {
  cleanTrendsData,
  parseRelatedQueries,
  extractKeywordFromUrl,
  extractTimeRangeFromUrl,
  isRelatedSearchesRequest,
  isTimelineRequest
} from "../src/lib/trends.js"

test("cleanTrendsData removes XSSI prefix with comma", () => {
  const raw = `)]}',\n{"default":{"ok":true}}`
  const cleaned = cleanTrendsData(raw)

  assert.equal(cleaned, `{"default":{"ok":true}}`)
})

test("parseRelatedQueries parses rising and top ranked keywords", () => {
  const response = `)]}',\n${JSON.stringify({
    default: {
      rankedList: [
        { rankedKeyword: [{ query: "translator" }, { query: "calculator" }] },
        { rankedKeyword: [{ query: "generator" }] }
      ]
    }
  })}`

  const result = parseRelatedQueries(response)

  assert.deepEqual(result.rising, ["translator", "calculator"])
  assert.deepEqual(result.top, ["generator"])
})

test("extractKeywordFromUrl supports req payload format", () => {
  const req = encodeURIComponent(
    JSON.stringify({
      comparisonItem: [{ keyword: "translator", time: "today 12-m", geo: "" }]
    })
  )
  const url = `https://trends.google.com/trends/api/widgetdata/multiline?req=${req}`

  assert.equal(extractKeywordFromUrl(url), "translator")
  assert.equal(extractTimeRangeFromUrl(url), "today 12-m")
})

test("request type helpers detect Trends widgetdata endpoints", () => {
  assert.equal(
    isRelatedSearchesRequest(
      "https://trends.google.com/trends/api/widgetdata/relatedsearches?req=1"
    ),
    true
  )
  assert.equal(
    isTimelineRequest(
      "https://trends.google.com/trends/api/widgetdata/multiline?req=1"
    ),
    true
  )
})
