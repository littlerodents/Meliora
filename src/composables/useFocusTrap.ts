import { ref, watch, onMounted, onBeforeUnmount, type Ref } from 'vue'
import { getFocusableEdges } from '../utils/dom'

export function useFocusTrap(
  containerRef: Ref<HTMLElement | null>,
  active: Ref<boolean>,
  onClose?: () => void,
) {
  const triggerRef = ref<HTMLElement | null>(null)

  function handleTab(e: KeyboardEvent) {
    if (!containerRef.value || !active.value) return

    const { first, last } = getFocusableEdges(containerRef.value)
    if (!first || !last) return

    if (e.shiftKey) {
      if (document.activeElement === first) {
        e.preventDefault()
        last.focus()
      }
    } else {
      if (document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape' && active.value) {
      e.preventDefault()
      if (onClose) {
        onClose()
      }
      return
    }

    if (e.key === 'Tab') {
      handleTab(e)
    }
  }

  function activateTrap() {
    triggerRef.value = document.activeElement as HTMLElement

    if (containerRef.value) {
      const { first } = getFocusableEdges(containerRef.value)
      if (first) {
        setTimeout(() => {
          first.focus()
        }, 0)
      }
    }
  }

  function deactivateTrap() {
    if (triggerRef.value && typeof triggerRef.value.focus === 'function') {
      setTimeout(() => {
        triggerRef.value?.focus()
      }, 0)
    }
    triggerRef.value = null
  }

  watch(
    active,
    (isActive) => {
      if (isActive) {
        activateTrap()
      } else {
        deactivateTrap()
      }
    },
    { immediate: true },
  )

  onMounted(() => {
    document.addEventListener('keydown', handleKeydown)
  })

  onBeforeUnmount(() => {
    document.removeEventListener('keydown', handleKeydown)
  })
}
