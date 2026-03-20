"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const trends_js_1 = require("../src/lib/trends.js");
(0, node_test_1.default)("cleanTrendsData removes XSSI prefix with comma", () => {
    const raw = `)]}',\n{"default":{"ok":true}}`;
    const cleaned = (0, trends_js_1.cleanTrendsData)(raw);
    strict_1.default.equal(cleaned, `{"default":{"ok":true}}`);
});
(0, node_test_1.default)("parseRelatedQueries parses rising and top ranked keywords", () => {
    const response = `)]}',\n${JSON.stringify({
        default: {
            rankedList: [
                { rankedKeyword: [{ query: "translator" }, { query: "calculator" }] },
                { rankedKeyword: [{ query: "generator" }] }
            ]
        }
    })}`;
    const result = (0, trends_js_1.parseRelatedQueries)(response);
    strict_1.default.deepEqual(result.rising, ["translator", "calculator"]);
    strict_1.default.deepEqual(result.top, ["generator"]);
});
(0, node_test_1.default)("extractKeywordFromUrl supports req payload format", () => {
    const req = encodeURIComponent(JSON.stringify({
        comparisonItem: [{ keyword: "translator", time: "today 12-m", geo: "" }]
    }));
    const url = `https://trends.google.com/trends/api/widgetdata/multiline?req=${req}`;
    strict_1.default.equal((0, trends_js_1.extractKeywordFromUrl)(url), "translator");
    strict_1.default.equal((0, trends_js_1.extractTimeRangeFromUrl)(url), "today 12-m");
});
(0, node_test_1.default)("request type helpers detect Trends widgetdata endpoints", () => {
    strict_1.default.equal((0, trends_js_1.isRelatedSearchesRequest)("https://trends.google.com/trends/api/widgetdata/relatedsearches?req=1"), true);
    strict_1.default.equal((0, trends_js_1.isTimelineRequest)("https://trends.google.com/trends/api/widgetdata/multiline?req=1"), true);
});
