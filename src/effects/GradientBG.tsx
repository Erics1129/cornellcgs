/**
 * Gradient background (§5.1) — placeholder implementation.
 * The full version is a WebGL plane with a breathing glow, grain and theme
 * lerp; this CSS stand-in keeps the page lit until it lands.
 */
export default function GradientBG() {
  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 z-0"
      style={{
        background: `
          radial-gradient(120% 55% at 50% 108%, color-mix(in srgb, var(--glow) 55%, transparent), transparent 70%),
          linear-gradient(to bottom, var(--bg-top) 0%, var(--bg-mid) 62%, var(--bg-bot) 100%)
        `,
      }}
    />
  )
}
