export default defineNuxtPlugin(() => {
  const origin = useState<{ x: number; y: number } | null>('theme-transition-origin', () => null)
  const pointer = (event: PointerEvent) => {
    origin.value = { x: event.clientX, y: event.clientY }
  }
  const keyboard = () => {
    origin.value = null
  }
  window.addEventListener('pointerdown', pointer, true)
  window.addEventListener('keydown', keyboard, true)
  if (import.meta.hot)
    import.meta.hot.dispose(() => {
      window.removeEventListener('pointerdown', pointer, true)
      window.removeEventListener('keydown', keyboard, true)
    })
})
