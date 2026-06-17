import { onBeforeUnmount, onMounted, ref } from 'vue'

export interface UseFullscreenOptions {
  onShowNotice: (msg: string) => void
}

export function useFullscreen(options: UseFullscreenOptions) {
  const { onShowNotice } = options

  const fullscreenActive = ref(false)

  function isBrowserFullscreen() {
    const width = Math.max(window.screen.width, window.screen.availWidth)
    const height = Math.max(window.screen.height, window.screen.availHeight)
    return window.innerWidth >= width - 2 && window.innerHeight >= height - 2
  }

  function syncFullscreenState() {
    fullscreenActive.value = Boolean(document.fullscreenElement) || isBrowserFullscreen()
  }

  async function toggleFullscreenMode() {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen()
        return
      }
      if (isBrowserFullscreen()) {
        onShowNotice('请按 F11 退出浏览器全屏')
        syncFullscreenState()
        return
      }
      await document.documentElement.requestFullscreen()
    } catch {
      onShowNotice('浏览器暂时无法进入全屏')
    } finally {
      syncFullscreenState()
    }
  }

  onMounted(() => {
    document.addEventListener('fullscreenchange', syncFullscreenState)
    window.addEventListener('resize', syncFullscreenState)
    window.visualViewport?.addEventListener('resize', syncFullscreenState)
    syncFullscreenState()
  })

  onBeforeUnmount(() => {
    document.removeEventListener('fullscreenchange', syncFullscreenState)
    window.removeEventListener('resize', syncFullscreenState)
    window.visualViewport?.removeEventListener('resize', syncFullscreenState)
  })

  return {
    fullscreenActive,
    isBrowserFullscreen,
    syncFullscreenState,
    toggleFullscreenMode,
  }
}
