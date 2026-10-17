/**
 * Reads a mart statement in the browser: pulls the page images out of the PDF (the mart's PDFs are scanned JPEGs),
 * or renders text PDFs with pdf.js, then reads them with Tesseract OCR. Nothing is uploaded anywhere — Tesseract and
 * pdf.js load from public CDNs the first time (a few MB, then cached by the browser).
 */

import { parseStatement, reconcile, type Statement } from './sale-statement'

const TESSERACT = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js'
const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js'
const PDFJS_WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'

export interface PageImage { url: string; width: number; height: number }
export interface LineCrop { page: number; x0: number; y0: number; x1: number; y1: number }
export interface ReadResult {
  statement: Statement
  pages: PageImage[]
  /** Where each statement line was found on its page (keyed by the line's raw text) */
  crops: Record<string, LineCrop>
}

type Progress = (message: string, fraction?: number) => void

const scripts = new Map<string, Promise<void>>()
function loadScript(src: string): Promise<void> {
  if (!scripts.has(src)) {
    scripts.set(src, new Promise((resolve, reject) => {
      const el = document.createElement('script')
      el.src = src
      el.async = true
      el.crossOrigin = 'anonymous'
      el.onload = () => resolve()
      el.onerror = () => { scripts.delete(src); reject(new Error('Couldn’t load the statement reader — check your internet connection and try again')) }
      document.head.appendChild(el)
    }))
  }
  return scripts.get(src)!
}

/** JPEG images embedded in a PDF (DCTDecode streams), in page order. */
export function extractJpegs(buf: ArrayBuffer): Blob[] {
  const bytes = new Uint8Array(buf)
  const text = new TextDecoder('latin1').decode(bytes)
  const out: Blob[] = []
  const re = /stream\r?\n/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    const dictStart = text.lastIndexOf('<<', m.index)
    const dict = text.slice(dictStart, m.index)
    if (!/\/DCTDecode/.test(dict) || !/\/Subtype\s*\/Image/.test(dict)) continue
    const start = m.index + m[0].length
    const len = dict.match(/\/Length\s+(\d+)(?!\s+\d+\s+R)/)
    let end = len ? start + Number(len[1]) : text.indexOf('endstream', start)
    if (end <= start) continue
    // Trim to the JPEG end marker in case /Length was indirect.
    if (!len) while (end > start && !(bytes[end - 2] === 0xff && bytes[end - 1] === 0xd9)) end--
    if (bytes[start] !== 0xff || bytes[start + 1] !== 0xd8) continue
    out.push(new Blob([bytes.slice(start, end)], { type: 'image/jpeg' }))
    re.lastIndex = end
  }
  return out
}

async function imageSize(url: string): Promise<{ width: number; height: number }> {
  const img = new Image()
  img.src = url
  await img.decode()
  return { width: img.naturalWidth, height: img.naturalHeight }
}

async function scaled(url: string, factor: number): Promise<Blob> {
  const img = new Image()
  img.src = url
  await img.decode()
  const c = document.createElement('canvas')
  c.width = img.naturalWidth * factor
  c.height = img.naturalHeight * factor
  const ctx = c.getContext('2d')!
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, 0, 0, c.width, c.height)
  return new Promise((res) => c.toBlob((b) => res(b!), 'image/png'))
}

/** Text PDFs: the text itself when it has lines, else each page rendered as an image. */
async function readWithPdfJs(buf: ArrayBuffer, progress: Progress): Promise<{ texts: string[] | null; images: Blob[] }> {
  progress('Opening the PDF…')
  await loadScript(PDFJS)
  const pdfjs = (window as any).pdfjsLib
  pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise
  const texts: string[] = []
  const images: Blob[] = []
  for (let p = 1; p <= Math.min(doc.numPages, 20); p++) {
    const page = await doc.getPage(p)
    const content = await page.getTextContent()
    const rows = new Map<number, { x: number; s: string }[]>()
    for (const it of content.items as { str: string; transform: number[] }[]) {
      if (!it.str.trim()) continue
      const y = Math.round(it.transform[5] / 3)
      rows.set(y, [...(rows.get(y) || []), { x: it.transform[4], s: it.str }])
    }
    texts.push([...rows.entries()].sort((a, b) => b[0] - a[0]).map(([, xs]) => xs.sort((a, b) => a.x - b.x).map((x) => x.s).join(' ')).join('\n'))
    const viewport = page.getViewport({ scale: 2 })
    const canvas = document.createElement('canvas')
    canvas.width = viewport.width
    canvas.height = viewport.height
    await page.render({ canvasContext: canvas.getContext('2d')!, viewport }).promise
    images.push(await new Promise<Blob>((res) => canvas.toBlob((b) => res(b!), 'image/png')))
  }
  const hasText = texts.some((t) => /UK\s?\d{6}/.test(t))
  return { texts: hasText ? texts : null, images }
}

interface OcrPage { text: string; lines: { text: string; bbox: { x0: number; y0: number; x1: number; y1: number } }[] }

async function ocr(images: Blob[], progress: Progress, opts: { scale?: number; whitelist?: boolean } = {}): Promise<OcrPage[]> {
  progress('Loading the statement reader…')
  await loadScript(TESSERACT)
  const T = (window as any).Tesseract
  let page = 0
  const worker = await T.createWorker('eng', 1, {
    logger: (m: { status: string; progress: number }) => {
      if (m.status === 'recognizing text') progress(`Reading page ${page + 1} of ${images.length}…`, (page + m.progress) / images.length)
    },
  })
  if (opts.whitelist) await worker.setParameters({ tessedit_char_whitelist: '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz/.,-*&£ ' })
  const out: OcrPage[] = []
  try {
    for (page = 0; page < images.length; page++) {
      const img = opts.scale && opts.scale !== 1 ? await scaled(URL.createObjectURL(images[page]), opts.scale) : images[page]
      const r = await worker.recognize(img)
      const f = opts.scale || 1
      out.push({
        text: r.data.text,
        lines: (r.data.lines || []).map((l: any) => ({ text: String(l.text).trim(), bbox: { x0: l.bbox.x0 / f, y0: l.bbox.y0 / f, x1: l.bbox.x1 / f, y1: l.bbox.y1 / f } })),
      })
    }
  } finally {
    await worker.terminate()
  }
  return out
}

function score(s: Statement) {
  const r = reconcile(s)
  return (r.matches ? 1000 : 0) + s.rows.length + (s.saleRef ? 1 : 0)
}

export async function readStatementFile(file: File, progress: Progress): Promise<ReadResult> {
  const buf = await file.arrayBuffer()
  let images: Blob[] = []
  let texts: string[] | null = null
  if (file.type.startsWith('image/')) images = [file]
  else {
    if (!new TextDecoder('latin1').decode(new Uint8Array(buf, 0, Math.min(1024, buf.byteLength))).includes('%PDF')) {
      throw new Error('That isn’t a PDF. Drop the PDF from the mart’s email (or a photo of the statement).')
    }
    images = extractJpegs(buf)
    if (!images.length) ({ texts, images } = await readWithPdfJs(buf, progress))
  }
  if (!images.length && !texts) throw new Error('Couldn’t find any pages in that file')
  const pages = await Promise.all(images.map(async (b) => { const url = URL.createObjectURL(b); return { url, ...(await imageSize(url)) } }))

  if (texts) return { statement: parseStatement(texts), pages, crops: {} }

  let read = await ocr(images, progress)
  let statement = parseStatement(read.map((p) => p.text))
  // Not adding up? Read again a different way and keep whichever reading fits the totals best.
  if (!reconcile(statement).matches || (statement.totals.head && statement.rows.length !== statement.totals.head)) {
    progress('Double-checking…')
    const again = await ocr(images, progress, { scale: 2, whitelist: true })
    const second = parseStatement(again.map((p) => p.text))
    if (score(second) > score(statement)) { statement = { ...second, saleRef: second.saleRef ?? statement.saleRef, title: second.title ?? statement.title, date: second.date ?? statement.date }; read = again }
  }
  if (!statement.rows.length) throw new Error('Couldn’t find any animals in that file. Is it the mart’s sellers list?')

  const crops: Record<string, LineCrop> = {}
  read.forEach((p, page) => {
    for (const l of p.lines) if (!crops[l.text.replace(/\s+/g, ' ')]) crops[l.text.replace(/\s+/g, ' ')] = { page, ...l.bbox }
  })
  return { statement, pages, crops }
}
