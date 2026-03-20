"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseTimelineSeriesValues = parseTimelineSeriesValues;
exports.parseTimelineResponse = parseTimelineResponse;
exports.parseTimelineData = parseTimelineData;
exports.isNewWordEffective = isNewWordEffective;
exports.isNewWordEffectiveByBase = isNewWordEffectiveByBase;
exports.analyzeKeyword = analyzeKeyword;
exports.extractKeywordDataFromMultiLine = extractKeywordDataFromMultiLine;
exports.calculateKeywordPriority = calculateKeywordPriority;
exports.filterLowValueKeywords = filterLowValueKeywords;
exports.sortKeywordsByPriority = sortKeywordsByPriority;
const trends_1 = require("./trends");
function parseTrendValue(rawValue) {
    if (typeof rawValue === "number") {
        return rawValue;
    }
    if (typeof rawValue === "string") {
        if (rawValue.includes("<1")) {
            return 0;
        }
        const normalized = rawValue.replace(/,/g, "").trim();
        return parseInt(normalized, 10) || 0;
    }
    return 0;
}
function parseTimelineSeriesValues(jsonResponse) {
    if (!jsonResponse) {
        return [];
    }
    try {
        const cleaned = (0, trends_1.cleanTrendsData)(jsonResponse);
        const data = JSON.parse(cleaned);
        const timelineData = data.default?.timelineData;
        if (!Array.isArray(timelineData) || timelineData.length === 0) {
            return [];
        }
        const firstItem = timelineData[0];
        const firstSeriesSource = Array.isArray(firstItem?.value)
            ? firstItem.value
            : Array.isArray(firstItem?.formattedValue)
                ? firstItem.formattedValue
                : [firstItem?.value ?? firstItem?.formattedValue ?? 0];
        const seriesCount = Math.max(1, firstSeriesSource.length);
        const seriesValues = Array.from({ length: seriesCount }, () => []);
        for (const item of timelineData) {
            const sourceValues = Array.isArray(item.value)
                ? item.value
                : Array.isArray(item.formattedValue)
                    ? item.formattedValue
                    : [item.value ?? item.formattedValue ?? 0];
            for (let index = 0; index < seriesCount; index += 1) {
                const rawValue = sourceValues[index] ?? 0;
                seriesValues[index].push(parseTrendValue(rawValue));
            }
        }
        return seriesValues;
    }
    catch (error) {
        console.error("解析时间线序列失败:", error);
        return [];
    }
}
/**
 * 解析时间线数据 (从 JSON 响应)
 * Google Trends API 返回的是 JSON，需要先提取 timelineData
 */
function parseTimelineResponse(jsonResponse, timeRange = "today 12-m") {
    if (!jsonResponse) {
        return [];
    }
    try {
        const cleaned = (0, trends_1.cleanTrendsData)(jsonResponse);
        const data = JSON.parse(cleaned);
        const timelineData = data.default?.timelineData;
        if (!Array.isArray(timelineData) || timelineData.length === 0) {
            return [];
        }
        // 转换为 "时间,值" 格式
        const formattedData = timelineData
            .map((item) => {
            const firstSeriesValue = Array.isArray(item.value)
                ? item.value[0]
                : Array.isArray(item.formattedValue)
                    ? item.formattedValue[0]
                    : item.value ?? item.formattedValue ?? "0";
            return `${item.time},${parseTrendValue(firstSeriesValue)}`;
        })
            .join("\n");
        return parseTimelineData(formattedData, timeRange);
    }
    catch (error) {
        console.error("解析时间线 JSON 失败:", error);
        return [];
    }
}
/**
 * 解析时间线数据
 * Google Trends 返回的数据格式: "时间1,值1\n时间2,值2..."
 */
function parseTimelineData(timelineData, timeRange = "today 12-m") {
    if (!timelineData) {
        return [];
    }
    const lines = timelineData.trim().split("\n");
    const points = [];
    for (const line of lines) {
        const parts = line.split(",");
        if (parts.length >= 2) {
            const time = parts[0];
            const rawValue = parts[1];
            // 处理各种可能的值格式
            let value = 0;
            if (rawValue === "0" || rawValue === "") {
                value = 0;
            }
            else if (rawValue.includes("<1")) {
                value = 0;
            }
            else {
                value = parseInt(rawValue, 10) || 0;
            }
            points.push({
                time,
                value,
                formattedValue: value === 0 ? "0" : value.toString(),
                hasData: rawValue !== "" && rawValue !== "0",
                isZero: value === 0
            });
        }
    }
    return points;
}
/**
 * 判断是否为有效新词
 * 规则:
 * 1. 前 N 个时间点的搜索量都为 0 (根据时间范围确定)
 * 2. 后期有增长趋势 (最后几个点的平均值 >= 阈值)
 */
function isNewWordEffective(timeline, threshold = 10, timeRange = "today 12-m") {
    if (timeline.length < 6) {
        return false;
    }
    // 根据时间范围确定检查前几个点
    const checkFirstPoints = Math.min(5, Math.floor(timeline.length / 3));
    // 检查前 N 个点是否都为 0
    const firstPoints = timeline.slice(0, checkFirstPoints);
    const allFirstZero = firstPoints.every((p) => p.isZero);
    if (!allFirstZero) {
        return false;
    }
    // 检查最后几个点的平均值
    const lastPoints = timeline.slice(-5);
    const avgLastValue = lastPoints.reduce((sum, p) => sum + p.value, 0) / lastPoints.length;
    return avgLastValue >= threshold;
}
function isNewWordEffectiveByBase(candidateTimeline, baseTimeline, threshold = 20) {
    if (candidateTimeline.length < 6 || baseTimeline.length < 6) {
        return false;
    }
    const checkFirstPoints = Math.min(5, Math.floor(candidateTimeline.length / 3));
    const allFirstZero = candidateTimeline
        .slice(0, checkFirstPoints)
        .every((value) => value === 0);
    if (!allFirstZero) {
        return false;
    }
    const candidateLastFive = candidateTimeline.slice(-5);
    const baseLastFive = baseTimeline.slice(-5);
    const candidateLastFiveAvg = candidateLastFive.reduce((sum, value) => sum + value, 0) / candidateLastFive.length;
    const baseLastFiveAvg = baseLastFive.reduce((sum, value) => sum + value, 0) / baseLastFive.length;
    if (baseLastFiveAvg <= 0) {
        return false;
    }
    const percentage = (candidateLastFiveAvg / baseLastFiveAvg) * 100;
    return percentage >= threshold;
}
/**
 * 分析关键词是否为新词
 */
function analyzeKeyword(keyword, timelineData, threshold = 10, timeRange = "today 12-m") {
    const timeline = parseTimelineData(timelineData, timeRange);
    if (timeline.length === 0) {
        return {
            keyword,
            isEffective: false,
            reason: "无时间线数据"
        };
    }
    const isEffective = isNewWordEffective(timeline, threshold, timeRange);
    const avgValue = timeline.reduce((sum, p) => sum + p.value, 0) / timeline.length;
    return {
        keyword,
        isEffective,
        reason: isEffective
            ? `前5个点为0, 后期平均值为${avgValue.toFixed(1)}`
            : `前期有搜索量或后期增长不足 (平均值: ${avgValue.toFixed(1)})`,
        timeline,
        avgValue
    };
}
/**
 * 从多线数据中提取关键词数据
 */
function extractKeywordDataFromMultiLine(widgetData, keyword) {
    try {
        const timelineData = widgetData["timelineData"];
        if (!timelineData) {
            return null;
        }
        const timeline = parseTimelineData(timelineData);
        const avgValue = timeline.reduce((sum, p) => sum + p.value, 0) / timeline.length;
        const maxRisingValue = Math.max(...timeline.map((p) => p.value));
        const lastValue = timeline[timeline.length - 1]?.value || 0;
        return {
            keyword,
            timeline,
            avgValue,
            maxRisingValue,
            lastValue
        };
    }
    catch (error) {
        console.error("提取关键词数据失败:", error);
        return null;
    }
}
/**
 * 计算关键词优先级 (用于队列排序)
 * 返回值越大，优先级越高
 */
function calculateKeywordPriority(keywordData) {
    const { avgValue, maxRisingValue, lastValue } = keywordData;
    // 综合考虑平均值的增长趋势和最新值
    const growthScore = maxRisingValue - avgValue;
    const recencyScore = lastValue * 1.5;
    return growthScore + recencyScore;
}
/**
 * 过滤低价值关键词
 */
function filterLowValueKeywords(keywords, minLength = 2) {
    return keywords.filter((kw) => {
        // 过滤太短的词
        if (kw.length < minLength) {
            return false;
        }
        // 过滤纯数字
        if (/^\d+$/.test(kw)) {
            return false;
        }
        // 过滤特殊字符过多的词
        if (/[^\w\s\u4e00-\u9fa5]/.test(kw)) {
            return false;
        }
        return true;
    });
}
/**
 * 对关键词进行排序
 * 按照优先级从高到低排序
 */
function sortKeywordsByPriority(keywordsData) {
    return [...keywordsData].sort((a, b) => {
        const priorityA = calculateKeywordPriority(a);
        const priorityB = calculateKeywordPriority(b);
        return priorityB - priorityA;
    });
}
