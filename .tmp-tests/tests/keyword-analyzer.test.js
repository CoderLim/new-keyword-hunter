"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const keyword_analyzer_js_1 = require("../src/lib/keyword-analyzer.js");
(0, node_test_1.default)("parseTimelineSeriesValues returns multi-series values from timelineData", () => {
    const response = `)]}',\n${JSON.stringify({
        default: {
            timelineData: [
                { time: "1", value: [10, 0] },
                { time: "2", value: [20, 5] },
                { time: "3", value: [30, "<1"] }
            ]
        }
    })}`;
    const series = (0, keyword_analyzer_js_1.parseTimelineSeriesValues)(response);
    strict_1.default.deepEqual(series, [
        [10, 20, 30],
        [0, 5, 0]
    ]);
});
(0, node_test_1.default)("parseTimelineResponse reads first series from array values", () => {
    const response = `)]}',\n${JSON.stringify({
        default: {
            timelineData: [
                { time: "1", value: [0, 9] },
                { time: "2", value: [15, 6] }
            ]
        }
    })}`;
    const points = (0, keyword_analyzer_js_1.parseTimelineResponse)(response);
    strict_1.default.equal(points.length, 2);
    strict_1.default.equal(points[0].value, 0);
    strict_1.default.equal(points[1].value, 15);
});
(0, node_test_1.default)("isNewWordEffectiveByBase returns true when candidate meets base-relative threshold", () => {
    const candidateTimeline = [0, 0, 0, 0, 0, 20, 20, 20, 20, 20];
    const baseTimeline = [10, 10, 10, 10, 10, 50, 50, 50, 50, 50];
    strict_1.default.equal((0, keyword_analyzer_js_1.isNewWordEffectiveByBase)(candidateTimeline, baseTimeline, 30), true);
});
(0, node_test_1.default)("isNewWordEffectiveByBase returns false when first points are non-zero", () => {
    const candidateTimeline = [1, 0, 0, 0, 0, 20, 20, 20, 20, 20];
    const baseTimeline = [10, 10, 10, 10, 10, 50, 50, 50, 50, 50];
    strict_1.default.equal((0, keyword_analyzer_js_1.isNewWordEffectiveByBase)(candidateTimeline, baseTimeline, 30), false);
});
(0, node_test_1.default)("isNewWordEffectiveByBase returns false when base series has zero average", () => {
    const candidateTimeline = [0, 0, 0, 0, 0, 20, 20, 20, 20, 20];
    const baseTimeline = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    strict_1.default.equal((0, keyword_analyzer_js_1.isNewWordEffectiveByBase)(candidateTimeline, baseTimeline, 30), false);
});
