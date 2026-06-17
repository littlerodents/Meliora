import { shallowRef, triggerRef } from 'vue'
import type { ShallowRef } from 'vue'

const loadedCovers = shallowRef(new Set<string>())
const failedCovers = shallowRef(new Set<string>())

export interface UseCoverCacheReturn {
  loadedCovers: ShallowRef<Set<string>>
  failedCovers: ShallowRef<Set<string>>
  markCoverLoaded: (trackId: string) => void
  markCoverFailed: (trackId: string) => void
}

export function useCoverCache(): UseCoverCacheReturn {
  function markCoverLoaded(trackId: string) {
    loadedCovers.value.add(trackId)
    triggerRef(loadedCovers)
  }

  function markCoverFailed(trackId: string) {
    failedCovers.value.add(trackId)
    triggerRef(failedCovers)
  }

  return {
    loadedCovers,
    failedCovers,
    markCoverLoaded,
    markCoverFailed,
  }
}
