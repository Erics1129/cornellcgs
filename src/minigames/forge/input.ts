/** One captured gesture. A look drag must never turn into a station tap. */
export class ForgePointerGesture {
  private active: { id: number; x: number; y: number; dragged: boolean } | null = null
  begin(id: number, x: number, y: number) {
    if (this.active) return false
    this.active = { id, x, y, dragged: false }
    return true
  }
  move(id: number, x: number, y: number) {
    const a = this.active
    if (!a || a.id !== id) return false
    a.dragged ||= Math.hypot(x - a.x, y - a.y) > .015
    return true
  }
  end(id: number, x: number, y: number) {
    if (!this.move(id, x, y)) return null
    const phase = this.active!.dragged ? 'cancel' : 'up'
    this.active = null
    return phase
  }
  cancel(id?: number) {
    if (!this.active || (id !== undefined && this.active.id !== id)) return false
    this.active = null
    return true
  }
}

export function panelShortcut(event: { code: string; repeat: boolean; altKey: boolean; ctrlKey: boolean; metaKey: boolean }) {
  if (event.repeat || event.altKey || event.ctrlKey || event.metaKey) return null
  return /^Key[THLVN]$/.test(event.code) ? event.code : null
}
