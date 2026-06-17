import { ref } from 'vue'
import type { Ref } from 'vue'

const CHROME_IDLE_DELAY = 30000

export interface UseChromeAutoHideOptions {
  listOpen: Ref<boolean>
  settingsOpen: Ref<boolean>
  autoHideChrome: () => boolean
}

export function useChromeAutoHide(options: UseChromeAutoHideOptions) {
  const { listOpen, settingsOpen, autoHideChrome } = options

  const chromeHidden = ref(false)
  let chromeIdleTimer = 0

  function scheduleChromeHide() {
    window.clearTimeout(chromeIdleTimer)
    if (!autoHideChrome() || listOpen.value || settingsOpen.value) {
      chromeHidden.value = false
      return
    }
    chromeIdleTimer = window.setTimeout(() => {
      if (autoHideChrome() && !listOpen.value && !settingsOpen.value) {
        chromeHidden.value = true
      }
    }, CHROME_IDLE_DELAY)
  }

  function revealChrome() {
    chromeHidden.value = false
    scheduleChromeHide()
  }

  function clearChromeTimer() {
    window.clearTimeout(chromeIdleTimer)
  }

  return {
    chromeHidden,
    scheduleChromeHide,
    revealChrome,
    clearChromeTimer,
  }
}
