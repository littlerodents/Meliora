import { APP_VERSION } from '../generated/app-version'
import { safeStorage } from '../utils/storage'

interface GitHubRelease {
  html_url?: string
  tag_name?: string
}

interface GitHubTag {
  name?: string
}

export interface UpdateInfo {
  currentVersion: string
  latestVersion: string
  url: string
}

interface CachedLatest {
  latestVersion: string
  url: string
}

interface UpdateCacheEntry {
  fetchedAt: number
  latest: CachedLatest | null
}

const REPOSITORY = 'abloom25/Meliora'
const UPDATE_CACHE_KEY = 'meliora:update-cache'
const UPDATE_CACHE_TTL_MS = 6 * 60 * 60 * 1000

function normalizeVersion(version: string) {
  return version
    .trim()
    .replace(/^refs\/tags\//, '')
    .replace(/^v/i, '')
}

function isComparableVersion(version: string) {
  const normalized = normalizeVersion(version)
  return normalized.length > 0
}

function isAbortError(err: unknown): boolean {
  if (err instanceof DOMException) return err.name === 'AbortError'
  if (err instanceof Error) return err.name === 'AbortError'
  return false
}

function readUpdateCache(): UpdateCacheEntry | null {
  const raw = safeStorage.getItem(UPDATE_CACHE_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as UpdateCacheEntry
  } catch {
    return null
  }
}

function writeUpdateCache(latest: CachedLatest | null): void {
  safeStorage.setItem(UPDATE_CACHE_KEY, JSON.stringify({ fetchedAt: Date.now(), latest }))
}

async function fetchLatestRelease(signal?: AbortSignal): Promise<UpdateInfo | null> {
  const response = await fetch(`https://api.github.com/repos/${REPOSITORY}/releases/latest`, {
    headers: { Accept: 'application/vnd.github+json' },
    signal,
  })
  if (!response.ok) return null
  const release = (await response.json()) as GitHubRelease
  if (!release.tag_name) return null
  return {
    currentVersion: APP_VERSION,
    latestVersion: release.tag_name,
    url: release.html_url || `https://github.com/${REPOSITORY}/releases/tag/${release.tag_name}`,
  }
}

async function fetchLatestTag(signal?: AbortSignal): Promise<UpdateInfo | null> {
  const response = await fetch(`https://api.github.com/repos/${REPOSITORY}/tags?per_page=1`, {
    headers: { Accept: 'application/vnd.github+json' },
    signal,
  })
  if (!response.ok) return null
  const tags = (await response.json()) as GitHubTag[]
  const tag = tags[0]?.name
  if (!tag) return null
  return {
    currentVersion: APP_VERSION,
    latestVersion: tag,
    url: `https://github.com/${REPOSITORY}/releases/tag/${tag}`,
  }
}

export async function checkForUpdate(
  signal?: AbortSignal,
  forceRefresh = false,
): Promise<UpdateInfo | null> {
  if (!import.meta.env.PROD || !isComparableVersion(APP_VERSION)) return null

  if (!forceRefresh) {
    const cache = readUpdateCache()
    if (cache && Date.now() - cache.fetchedAt < UPDATE_CACHE_TTL_MS) {
      if (!cache.latest) return null
      return normalizeVersion(APP_VERSION) === normalizeVersion(cache.latest.latestVersion)
        ? null
        : {
            currentVersion: APP_VERSION,
            latestVersion: cache.latest.latestVersion,
            url: cache.latest.url,
          }
    }
  }

  let latest: UpdateInfo | null
  try {
    latest =
      (await fetchLatestRelease(signal).catch((err: unknown) => {
        if (isAbortError(err)) throw err
        return null
      })) ??
      (await fetchLatestTag(signal).catch((err: unknown) => {
        if (isAbortError(err)) throw err
        return null
      }))
  } catch (err) {
    if (isAbortError(err)) throw err
    writeUpdateCache(null)
    return null
  }

  writeUpdateCache(latest ? { latestVersion: latest.latestVersion, url: latest.url } : null)

  if (!latest) return null
  return normalizeVersion(latest.currentVersion) === normalizeVersion(latest.latestVersion)
    ? null
    : latest
}
