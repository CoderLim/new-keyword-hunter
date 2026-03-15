import type { PlasmoCSConfig } from "plasmo"
import { isRelatedSearchesRequest, isTimelineRequest } from "~lib/trends"

export const config: PlasmoCSConfig = {
  matches: ["*://trends.google.com/*"],
  all_frames: true,
  run_at: "document_start"
}

const BRIDGE_EVENT_SOURCE = "nkh-interceptor"
const INJECT_FLAG = "__nkhInterceptorInstalled"

function forwardInterceptedResponse(url: string, body: string) {
  if (!(isRelatedSearchesRequest(url) || isTimelineRequest(url))) {
    return
  }

  chrome.runtime.sendMessage({
    type: "INTERCEPTED_RESPONSE",
    payload: { url, body }
  })
}

function setupBridgeListener() {
  window.addEventListener("message", (event) => {
    if (event.source !== window) {
      return
    }

    const payload = event.data as
      | { source?: string; url?: string; body?: string }
      | undefined

    if (!payload || payload.source !== BRIDGE_EVENT_SOURCE) {
      return
    }

    if (typeof payload.url !== "string" || typeof payload.body !== "string") {
      return
    }

    forwardInterceptedResponse(payload.url, payload.body)
  })
}

function injectPageInterceptor() {
  const script = document.createElement("script")
  script.textContent = `
    (() => {
      const bridgeSource = ${JSON.stringify(BRIDGE_EVENT_SOURCE)}
      const installFlag = ${JSON.stringify(INJECT_FLAG)}

      if (window[installFlag]) {
        return
      }

      window[installFlag] = true

      const normalizeUrl = (rawUrl) => {
        try {
          return new URL(rawUrl, window.location.origin).toString()
        } catch {
          return String(rawUrl || "")
        }
      }

      const shouldCapture = (url) =>
        url.includes('/trends/api/widgetdata/relatedsearches') ||
        url.includes('/trends/api/widgetdata/multiline')

      const emit = (url, body) => {
        if (!shouldCapture(url)) {
          return
        }

        window.postMessage(
          {
            source: bridgeSource,
            url,
            body
          },
          "*"
        )
      }

      const originalFetch = window.fetch
      window.fetch = async function (...args) {
        const response = await originalFetch.apply(this, args)
        const rawUrl = typeof args[0] === "string" ? args[0] : args[0]?.url || ""
        const url = normalizeUrl(rawUrl)

        if (shouldCapture(url)) {
          try {
            const body = await response.clone().text()
            emit(url, body)
          } catch {}
        }

        return response
      }

      const originalOpen = XMLHttpRequest.prototype.open
      const originalSend = XMLHttpRequest.prototype.send

      XMLHttpRequest.prototype.open = function (method, url, ...rest) {
        this.__nkhUrl = normalizeUrl(typeof url === "string" ? url : String(url))
        return originalOpen.apply(this, [method, url, ...rest])
      }

      XMLHttpRequest.prototype.send = function (...args) {
        const xhr = this
        const originalOnReadyStateChange = xhr.onreadystatechange

        xhr.onreadystatechange = function (...stateArgs) {
          if (xhr.readyState === XMLHttpRequest.DONE) {
            const url = xhr.__nkhUrl || ""

            if (shouldCapture(url)) {
              try {
                emit(url, xhr.responseText || "")
              } catch {}
            }
          }

          if (originalOnReadyStateChange) {
            return originalOnReadyStateChange.apply(this, stateArgs)
          }
        }

        return originalSend.apply(this, args)
      }
    })()
  `

  ;(document.documentElement || document.head || document.body).appendChild(script)
  script.remove()
}

setupBridgeListener()
injectPageInterceptor()

console.log("[NKH] Trends monitor injected")

