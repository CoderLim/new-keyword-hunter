"use strict";
/**
 * Google Trends 数据处理工具
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.cleanTrendsData = cleanTrendsData;
exports.parseRelatedQueries = parseRelatedQueries;
exports.parseTimelineData = parseTimelineData;
exports.buildTrendsUrl = buildTrendsUrl;
exports.buildRelatedSearchesUrl = buildRelatedSearchesUrl;
exports.buildTimelineUrl = buildTimelineUrl;
exports.isRelatedSearchesRequest = isRelatedSearchesRequest;
exports.isTimelineRequest = isTimelineRequest;
exports.extractKeywordFromUrl = extractKeywordFromUrl;
exports.extractTimeRangeFromUrl = extractTimeRangeFromUrl;
exports.extractGeoFromUrl = extractGeoFromUrl;
/**
 * 清理 Google Trends API 响应数据
 * Google Trends 返回的数据通常以特殊字符开头，需要移除
 */
function cleanTrendsData(data) {
    if (!data) {
        return "";
    }
    let cleaned = data.trim();
    // Google Trends 常见 XSSI 前缀：)]}', 或 )]}',\n
    cleaned = cleaned.replace(/^\)\]\}',?\s*/, "");
    // 兜底：有时会出现注释前缀
    cleaned = cleaned.replace(/^\/\*+\s*/, "");
    cleaned = cleaned.replace(/^\/\/+\s*/, "");
    return cleaned.trim();
}
/**
 * 解析相关搜索 JSON 响应
 */
function parseRelatedQueries(responseBody) {
    const cleaned = cleanTrendsData(responseBody);
    try {
        const data = JSON.parse(cleaned);
        const result = {
            rising: [],
            top: []
        };
        // 解析 rising queries
        const risingWidget = data.default?.rankedList?.[0];
        if (risingWidget?.rankedKeyword) {
            result.rising = risingWidget.rankedKeyword
                .map((item) => item?.query)
                .filter(Boolean);
        }
        // 解析 top queries
        const topWidget = data.default?.rankedList?.[1];
        if (topWidget?.rankedKeyword) {
            result.top = topWidget.rankedKeyword
                .map((item) => item?.query)
                .filter(Boolean);
        }
        return result;
    }
    catch (error) {
        console.error("解析相关搜索失败:", error);
        return { rising: [], top: [] };
    }
}
/**
 * 解析时间线数据响应
 */
function parseTimelineData(responseBody) {
    const cleaned = cleanTrendsData(responseBody);
    try {
        const data = JSON.parse(cleaned);
        const timelineData = data.default?.timelineData;
        if (Array.isArray(timelineData) && timelineData.length > 0) {
            // 格式: "time,value\ntime2,value2..."
            return timelineData
                .map((item) => {
                const value = item.formattedValue || "0";
                // 处理 "<1" 的情况
                const numValue = value.includes("<1") ? "0" : value;
                return `${item.time},${numValue}`;
            })
                .join("\n");
        }
        return null;
    }
    catch (error) {
        console.error("解析时间线数据失败:", error);
        return null;
    }
}
/**
 * 构建 Google Trends URL
 */
function buildTrendsUrl(keyword, options = {}) {
    const params = new URLSearchParams({
        q: keyword,
        ...(options.timeRange && { date: options.timeRange }),
        ...(options.geo && { geo: options.geo }),
        ...(options.category && { cat: options.category.toString() })
    });
    return `https://trends.google.com/trends/explore?${params.toString()}`;
}
/**
 * 构建相关搜索 API URL
 */
function buildRelatedSearchesUrl(keyword, timeRange = "today 12-m", geo = "") {
    const hl = "zh-CN";
    const tz = 480;
    const resolvedGeo = geo === undefined ? "CN" : geo;
    const params = new URLSearchParams({
        hl,
        tz: tz.toString(),
        date: timeRange,
        geo: resolvedGeo,
        gprop: "",
        q: keyword
    });
    return `https://trends.google.com/trends/api/widgetdata/relatedsearches?${params.toString()}`;
}
/**
 * 构建时间线 API URL
 */
function buildTimelineUrl(keyword, timeRange = "today 12-m", geo = "") {
    const hl = "zh-CN";
    const tz = 480;
    const resolvedGeo = geo === undefined ? "CN" : geo;
    const params = new URLSearchParams({
        hl,
        tz: tz.toString(),
        date: timeRange,
        geo: resolvedGeo,
        q: keyword,
        // 设备类型: all (全部), web (桌面), searches (搜索)
        gprop: ""
    });
    return `https://trends.google.com/trends/api/widgetdata/multiline?${params.toString()}`;
}
/**
 * 判断响应是否为相关搜索
 */
function isRelatedSearchesRequest(url) {
    return url.includes("/trends/api/widgetdata/relatedsearches");
}
/**
 * 判断响应是否为时间线数据
 */
function isTimelineRequest(url) {
    return url.includes("/trends/api/widgetdata/multiline");
}
function parseRequestParam(urlObj) {
    const req = urlObj.searchParams.get("req");
    if (!req) {
        return null;
    }
    try {
        return JSON.parse(req);
    }
    catch {
        try {
            return JSON.parse(decodeURIComponent(req));
        }
        catch {
            return null;
        }
    }
}
function extractKeywordFromReqData(reqData) {
    const comparisonItem = reqData.comparisonItem?.[0];
    if (typeof comparisonItem?.keyword === "string") {
        return comparisonItem.keyword;
    }
    const fromComparisonRestriction = comparisonItem?.complexKeywordsRestriction
        ?.keyword?.[0]?.value;
    if (typeof fromComparisonRestriction === "string") {
        return fromComparisonRestriction;
    }
    const fromRestriction = reqData.restriction?.complexKeywordsRestriction?.keyword?.[0]?.value;
    if (typeof fromRestriction === "string") {
        return fromRestriction;
    }
    return null;
}
/**
 * 从 URL 中提取关键词
 */
function extractKeywordFromUrl(url) {
    try {
        const urlObj = new URL(url);
        const q = urlObj.searchParams.get("q");
        if (q) {
            return decodeURIComponent(q);
        }
        const reqData = parseRequestParam(urlObj);
        if (reqData) {
            return extractKeywordFromReqData(reqData);
        }
        return null;
    }
    catch {
        return null;
    }
}
/**
 * 从 URL 中提取时间范围
 */
function extractTimeRangeFromUrl(url) {
    try {
        const urlObj = new URL(url);
        const date = urlObj.searchParams.get("date");
        if (date) {
            return date;
        }
        const reqData = parseRequestParam(urlObj);
        if (!reqData) {
            return "today 12-m";
        }
        const comparisonItem = reqData.comparisonItem?.[0];
        if (typeof reqData.time === "string") {
            return reqData.time;
        }
        if (typeof comparisonItem?.time === "string") {
            return comparisonItem.time;
        }
        return "today 12-m";
    }
    catch {
        return "today 12-m";
    }
}
/**
 * 从 URL 中提取地理位置
 */
function extractGeoFromUrl(url) {
    try {
        const urlObj = new URL(url);
        const geo = urlObj.searchParams.get("geo");
        if (geo) {
            return geo;
        }
        const reqData = parseRequestParam(urlObj);
        if (!reqData) {
            return "CN";
        }
        const comparisonItem = reqData.comparisonItem?.[0];
        if (typeof comparisonItem?.geo === "string" && comparisonItem.geo) {
            return comparisonItem.geo;
        }
        const country = comparisonItem?.geo
            ?.country;
        if (typeof country === "string" && country) {
            return country;
        }
        const restrictionCountry = reqData.restriction?.geo?.country;
        if (typeof restrictionCountry === "string" && restrictionCountry) {
            return restrictionCountry;
        }
        return "CN";
    }
    catch {
        return "CN";
    }
}
