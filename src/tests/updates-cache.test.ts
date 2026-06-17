import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../generated/app-version', () => ({ APP_VERSION: '1.0.0' }))

import { checkForUpdate } from '../services/updates'

const UPDATE_CACHE_KEY = 'meliora:update-cache'

function makeReleaseResponse(tag: string) {
  return new Response(
    JSON.stringify({
      tag_name: tag,
      html_url: `https://github.com/abloom25/Meliora/releases/tag/${tag}`,
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  )
}

function seedCache(fetchedAt: number, latest: { latestVersion: string; url: string } | null) {
  localStorage.setItem(UPDATE_CACHE_KEY, JSON.stringify({ fetchedAt, latest }))
}

function readCache(): {
  fetchedAt: number
  latest: { latestVersion: string; url: string } | null
} | null {
  const raw = localStorage.getItem(UPDATE_CACHE_KEY)
  if (!raw) return null
  return JSON.parse(raw)
}

describe('checkForUpdate TTL cache', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubEnv('PROD', true)
    localStorage.clear()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('(a) reuses cache within TTL without fetching', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    seedCache(Date.now(), {
      latestVersion: 'v2.0.0',
      url: 'https://github.com/abloom25/Meliora/releases/tag/v2.0.0',
    })

    const result = await checkForUpdate()

    expect(fetchMock).not.toHaveBeenCalled()
    expect(result).not.toBeNull()
    expect(result?.currentVersion).toBe('1.0.0')
    expect(result?.latestVersion).toBe('v2.0.0')
  })

  it('(b) fetches and writes cache when expired', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(makeReleaseResponse('v3.0.0'))
    vi.stubGlobal('fetch', fetchMock)

    const expiredAt = Date.now() - 7 * 60 * 60 * 1000
    seedCache(expiredAt, {
      latestVersion: 'v0.0.1',
      url: 'https://example.test/old',
    })

    const result = await checkForUpdate()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.github.com/repos/abloom25/Meliora/releases/latest',
      expect.objectContaining({ headers: { Accept: 'application/vnd.github+json' } }),
    )
    expect(result).not.toBeNull()
    expect(result?.latestVersion).toBe('v3.0.0')

    const cached = readCache()
    expect(cached).not.toBeNull()
    expect(cached?.latest?.latestVersion).toBe('v3.0.0')
    expect(cached?.fetchedAt).toBe(Date.now())
  })

  it('(c) forceRefresh bypasses cache and fetches', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(makeReleaseResponse('v4.0.0'))
    vi.stubGlobal('fetch', fetchMock)

    seedCache(Date.now(), {
      latestVersion: 'v2.0.0',
      url: 'https://example.test/cached',
    })

    const result = await checkForUpdate(undefined, true)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(result).not.toBeNull()
    expect(result?.latestVersion).toBe('v4.0.0')

    const cached = readCache()
    expect(cached?.latest?.latestVersion).toBe('v4.0.0')
  })

  it('returns null without fetching when cache holds a null latest within TTL', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    seedCache(Date.now(), null)

    const result = await checkForUpdate()

    expect(fetchMock).not.toHaveBeenCalled()
    expect(result).toBeNull()
  })

  it('returns null without fetching when cached latest equals current version', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    seedCache(Date.now(), {
      latestVersion: 'v1.0.0',
      url: 'https://example.test/same',
    })

    const result = await checkForUpdate()

    expect(fetchMock).not.toHaveBeenCalled()
    expect(result).toBeNull()
  })

  it('does not write cache when request is aborted', async () => {
    const abortErr = new DOMException('Aborted', 'AbortError')
    const fetchMock = vi.fn().mockRejectedValueOnce(abortErr)
    vi.stubGlobal('fetch', fetchMock)

    await expect(checkForUpdate()).rejects.toBe(abortErr)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(localStorage.getItem(UPDATE_CACHE_KEY)).toBeNull()
  })
})
