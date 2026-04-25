type UiSoundKind = 'success' | 'error' | 'info' | 'confirm'

function tone({
  frequency,
  durationMs,
  gain,
}: {
  frequency: number
  durationMs: number
  gain: number
}) {
  const Ctx = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctx) return
  const ctx = new Ctx()
  const oscillator = ctx.createOscillator()
  const g = ctx.createGain()
  oscillator.connect(g)
  g.connect(ctx.destination)
  oscillator.frequency.value = frequency
  g.gain.value = gain
  oscillator.start()
  window.setTimeout(() => {
    oscillator.stop()
    void ctx.close()
  }, durationMs)
}

export function playUiSound(kind: UiSoundKind) {
  try {
    if (typeof window === 'undefined') return
    switch (kind) {
      case 'success':
        tone({ frequency: 880, durationMs: 90, gain: 0.04 })
        return
      case 'error':
        tone({ frequency: 220, durationMs: 130, gain: 0.08 })
        return
      case 'confirm':
        tone({ frequency: 540, durationMs: 80, gain: 0.05 })
        return
      default:
        tone({ frequency: 440, durationMs: 70, gain: 0.03 })
    }
  } catch {
    // Best-effort UX enhancement; never block UI flow.
  }
}

