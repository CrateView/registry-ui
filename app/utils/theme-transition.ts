let current: ViewTransition | undefined
let sequence = 0

export async function transitionTheme(
  update: () => Promise<void>,
  origin: { x: number; y: number } | null,
) {
  const request = ++sequence
  if (current) {
    current.skipTransition()
    await current.updateCallbackDone.catch(() => {})
  }
  if (request !== sequence) return
  let applied = false
  const apply = async () => {
    if (applied) return
    applied = true
    await update()
  }
  if (!document.startViewTransition || matchMedia('(prefers-reduced-motion: reduce)').matches) {
    await apply()
    return
  }
  const x = origin?.x ?? innerWidth / 2
  const y = origin?.y ?? innerHeight / 2
  const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y))
  document.documentElement.style.setProperty('--x', `${x}px`)
  document.documentElement.style.setProperty('--y', `${y}px`)
  let transition: ViewTransition | undefined
  try {
    transition = document.startViewTransition(apply)
    current = transition
    await transition.ready
    if (request !== sequence) {
      transition.skipTransition()
      return
    }
    document.documentElement.animate(
      { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
      {
        duration: 400,
        easing: 'ease-in-out',
        pseudoElement: '::view-transition-new(root)',
      },
    )
    await transition.finished
  } catch {
    // Skipped transitions and unsupported animation APIs must still apply the preference.
    transition?.skipTransition()
    await apply()
  } finally {
    if (current === transition) current = undefined
  }
}
