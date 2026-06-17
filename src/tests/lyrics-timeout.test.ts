import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadLyricsText } from '../services/lyrics'

describe('loadLyricsText timeout', () => {
  afterEach(() => {
    // 还原所有 mock 与定时器，避免污染其它用例
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('rejects after 8 seconds when fetch never resolves', async () => {
    vi.useFakeTimers()

    // 让 fetch 永不 resolve，仅在 signal 被中止时拒绝（贴近真实浏览器行为）
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal
        if (signal) {
          if (signal.aborted) {
            reject(signal.reason ?? new DOMException('Aborted', 'AbortError'))
            return
          }
          signal.addEventListener('abort', () => {
            reject(signal.reason ?? new DOMException('Aborted', 'AbortError'))
          })
        }
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    const promise = loadLyricsText('https://example.test/lyric.lrc')
    // 兜底防止 unhandledRejection 干扰断言
    promise.catch(() => {})

    // 推进到 8000ms，触发本地 controller.abort()
    await vi.advanceTimersByTimeAsync(8000)

    await expect(promise).rejects.toBeDefined()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
