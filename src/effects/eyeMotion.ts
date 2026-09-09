const smooth = (t: number) => t * t * (3 - 2 * t)

/** A soft animated blink: quick close, short contact, slower eased opening. */
export function blinkClosure(seconds: number) {
  if (seconds < 0 || seconds >= .43) return 0
  if (seconds < .13) return smooth(seconds / .13)
  if (seconds < .16) return 1
  return 1 - smooth((seconds - .16) / .27)
}
