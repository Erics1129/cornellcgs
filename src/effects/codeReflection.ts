import { CFR_UPDATE, POT_EQUITY } from './codeSnippets'

/** Small, legible live reflection. Redrawn at 25Hz; no DOM/layout work. */
export class CodeReflection {
  canvas = document.createElement('canvas')
  private ctx: CanvasRenderingContext2D
  constructor() {
    this.canvas.width = 800; this.canvas.height = 500
    this.ctx = this.canvas.getContext('2d')!
  }
  paint(now: number) {
    const c = this.ctx
    const phase = (now + 4800) % 18000
    const source = phase < 9000 ? CFR_UPDATE : POT_EQUITY
    const text = source.join('\n')
    const t = phase % 9000
    const count = t < 7400 ? Math.min(text.length, Math.floor(t * .19)) : Math.max(0, text.length - Math.floor((t-7400)*.9))
    const rows = text.slice(0, count).split('\n').flatMap(line => line.match(/.{1,37}/g) || ['']).slice(-8)
    c.fillStyle = '#dce8f8'; c.fillRect(0,0,800,500)
    c.fillStyle = '#f6f8fc'; c.fillRect(0,0,800,44)
    c.font = '500 20px monospace'; c.fillStyle = '#365075'
    c.fillText(phase < 9000 ? 'cfr.ts' : 'equity.ts', 24,29)
    c.font = '600 32px monospace'
    rows.forEach((line,i) => {
      if (i === rows.length-1) { c.fillStyle='#bdcee9'; c.fillRect(0,57+i*51,800,50) }
      const words = line.split(/(\s+|\b)/)
      let x = 22
      for (const word of words) {
        c.fillStyle = /^(const|let|function|return|for|if|export|type)$/.test(word) ? '#224fc7' : /^\d/.test(word) ? '#7c3892' : '#142744'
        c.fillText(word,x,93+i*51); x+=c.measureText(word).width
      }
      if (i === rows.length-1) { c.fillStyle='#245fde'; c.fillRect(Math.min(770,x+2),66+i*51,12,35) }
    })
    c.fillStyle='#c0d2ec';c.fillRect(0,472,800,28)
    c.font='18px monospace';c.fillStyle='#234778';c.fillText('TypeScript                 CGS / research',22,493)
  }
}
