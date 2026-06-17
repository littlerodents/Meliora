export const FOCUSABLE_SELECTOR =
  'a[href],button:not([disabled]),input:not([disabled]):not([type=hidden]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'

export function getFocusableEdges(container: HTMLElement): {
  first: HTMLElement | null
  last: HTMLElement | null
} {
  const list = container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
  if (!list.length) return { first: null, last: null }
  return { first: list[0]!, last: list[list.length - 1]! }
}

export function isEditableElement(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return Boolean(
    target.closest('input:not([type="hidden"]),textarea,[contenteditable="true"],[role="search"]'),
  )
}
