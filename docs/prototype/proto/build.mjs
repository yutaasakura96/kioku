// Builds the self-contained prototype: fonts, wanakana and the question list inlined.
// Usage, from the repository root: node docs/prototype/proto/build.mjs
//
// Two paths differ from the script the prototype was first built with (#68): the output goes
// beside this directory rather than into a scratch one, and `node_modules` is the repository's.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..', '..', '..')
const out = join(here, '..', 'kioku-prototype.html')
const cache = join(here, '.fontcache')
mkdirSync(dirname(out), { recursive: true })
mkdirSync(cache, { recursive: true })

let html = readFileSync(join(here, 'prototype.src.html'), 'utf8')
const questions = readFileSync(join(here, 'questions.json'), 'utf8')

// Every Japanese glyph the page can show: what is written, plus all kana (typed readings).
const set = new Set()
for (const ch of html + questions) if (ch.codePointAt(0) >= 0x3000) set.add(ch)
for (let c = 0x3041; c <= 0x3096; c++) set.add(String.fromCodePoint(c))
for (let c = 0x30a1; c <= 0x30fc; c++) set.add(String.fromCodePoint(c))
const text = [...set].sort().join('')

const b64 = (buf) => Buffer.from(buf).toString('base64')
const face = (family, weight, style, data, range) =>
  `@font-face{font-family:'${family}';font-style:${style};font-weight:${weight};font-display:swap;src:url(data:font/woff2;base64,${data}) format('woff2');${range ? `unicode-range:${range};` : ''}}`

async function mincho(weight) {
  const key = join(cache, `mincho-${weight}-${createHash('sha1').update(text).digest('hex').slice(0, 10)}.woff2`)
  if (existsSync(key)) return readFileSync(key)
  const css = await (await fetch(`https://fonts.googleapis.com/css2?family=Shippori+Mincho:wght@${weight}&text=${encodeURIComponent(text)}`, {
    headers: { 'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36' },
  })).text()
  const url = css.match(/url\((https:[^)]+)\)/)?.[1]
  if (!url) throw new Error(`no font url for weight ${weight}: ${css.slice(0, 200)}`)
  const buf = Buffer.from(await (await fetch(url)).arrayBuffer())
  writeFileSync(key, buf)
  return buf
}

const fs = (pkg, file) => readFileSync(join(root, 'node_modules/@fontsource', pkg, 'files', file))
const faces = []
for (const w of [400, 500, 600]) faces.push(face('Shippori Mincho', w, 'normal', b64(await mincho(w))))
for (const w of [300, 400, 500]) faces.push(face('Newsreader', w, 'normal', b64(fs('newsreader', `newsreader-latin-${w}-normal.woff2`))))
faces.push(face('Newsreader', 400, 'italic', b64(fs('newsreader', 'newsreader-latin-400-italic.woff2'))))
for (const w of [400, 500]) faces.push(face('IBM Plex Mono', w, 'normal', b64(fs('ibm-plex-mono', `ibm-plex-mono-latin-${w}-normal.woff2`))))

const wanakana = readFileSync(join(root, 'node_modules/wanakana/wanakana.min.js'), 'utf8').replace(/\/\/# sourceMappingURL=.*$/m, '')
if (wanakana.includes('</script')) throw new Error('wanakana build contains a closing script tag')

html = html
  .replace('/*__FONTS__*/', () => faces.join('\n'))
  .replace('/*__WANAKANA__*/', () => wanakana)
  .replace('/*__QUESTIONS__*/[]', () => questions.trim())
writeFileSync(out, html)
console.log(`${out}\n${(html.length / 1024).toFixed(0)} KB, ${set.size} Japanese glyphs`)
