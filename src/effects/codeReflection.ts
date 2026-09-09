import { CFR_UPDATE, POT_EQUITY } from './codeSnippets'

/** Small, legible live reflection. Redrawn at 25Hz; no DOM/layout work. */
export class CodeReflection {
  canvas = document.createElement('canvas')
  private ctx: CanvasRenderingContext2D
  constructor() {
    this.canvas.width = 800; this.canvas.height = 500
    this.ctx = this.canvas.getContext('2d')!
  }
  paint(now: number, compact = false) {
    const c = this.ctx
    const phase = (now + 4800) % 18000
    const source = phase < 9000 ? CFR_UPDATE : POT_EQUITY
    const text = source.join('\n')
    const t = phase % 9000
    const count = t < 7400 ? Math.min(text.length, Math.floor(t * .19)) : Math.max(0, text.length - Math.floor((t-7400)*.9))
    const rows = text.slice(0, count).split('\n').flatMap(line => line.match(compact ? /.{1,18}/g : /.{1,29}/g) || ['']).slice(compact ? -5 : -6)
    const lineHeight = compact ? 76 : 61
    c.fillStyle = '#061426'; c.fillRect(0,0,800,500)
    c.fillStyle = '#10273e'; c.fillRect(0,0,800,52)
    c.font = '500 23px monospace'; c.fillStyle = '#94bfe8'
    c.fillText(phase < 9000 ? 'cfr.ts' : 'equity.ts', 36,35)
    c.fillStyle = '#83e1f5'; c.fillRect(36,49,120,3)
    c.font = `500 ${compact ? 62 : 39}px monospace`
    rows.forEach((line,i) => {
      if (i === rows.length-1) { c.fillStyle='#0b2034'; c.fillRect(0,78+i*lineHeight,800,lineHeight-2) }
      const words = line.split(/(\s+|\b)/)
      let x = 36
      for (const word of words) {
        c.fillStyle = /^(const|let|function|return|for|if|export|type)$/.test(word) ? '#b9afff' : /^\d/.test(word) ? '#7ce4e0' : '#d3eeff'
        c.fillText(word,x,120+i*lineHeight); x+=c.measureText(word).width
      }
      if (i === rows.length-1) { c.fillStyle='#9aeeff'; c.fillRect(Math.min(768,x+3),88+i*lineHeight,13,39) }
    })
  }
}
