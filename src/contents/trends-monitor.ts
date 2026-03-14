import type { PlasmoCSConfig } from "plasmo"
import { isRelatedSearchesRequest, isTimelineRequest } from "~lib/trends"

export const config: PlasmoCSConfig = {
  matches: ["*://trends.google.com/*"],
  all_frames: true
}

/**
 * 拦截 fetch 请求
 */
const originalFetch = window.fetch

window.fetch = async function (...args) {
  const response = await originalFetch.apply(this, args)

  // 只处理 Trends API 请求
  const url = typeof args[0] === "string" ? args[0] : args[0]?.url || ""

  if (
    url.includes("trends.google.com/trends/api/") &&
    (isRelatedSearchesRequest(url) || isTimelineRequest(url))
  ) {
    // 克隆响应以便读取
    const clonedResponse = response.clone()

    try {
      const body = await clonedResponse.text()

      // 发送数据到 background script
      chrome.runtime.sendMessage({
        type: "INTERCEPTED_RESPONSE",
        payload: { url, body }
      })
    } catch (error) {
      console.error("读取响应失败:", error)
    }
  }

  return response
}

/**
 * 拦截 XMLHttpRequest
 */
const originalOpen = XMLHttpRequest.prototype.open
const originalSend = XMLHttpRequest.prototype.send

XMLHttpRequest.prototype.open = function (method, url, ...rest) {
  this._url = url
  return originalOpen.apply(this, [method, url, ...rest] as never)
}

XMLHttpRequest.prototype.send = function (...args) {
  const xhr = this

  const originalOnReadyStateChange = xhr.onreadystatechange

  xhr.onreadystatechange = function () {
    if (xhr.readyState === XMLHttpRequest.DONE) {
      const url = xhr._url as string

      if (
        url?.includes("trends.google.com/trends/api/") &&
        (isRelatedSearchesRequest(url) || isTimelineRequest(url))
      ) {
        try {
          const body = xhr.responseText

          // 发送数据到 background script
          chrome.runtime.sendMessage({
            type: "INTERCEPTED_RESPONSE",
            payload: { url, body }
          })
        } catch (error) {
          console.error("读取 XHR 响应失败:", error)
        }
      }
    }

    if (originalOnReadyStateChange) {
      return originalOnReadyStateChange.apply(this, args as never)
    }
  }

  return originalSend.apply(this, args as never)
}

console.log("新词挖掘助手 Content Script 已加载")
