import { spawn } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const res = join(root, 'src-capacitor/android/app/src/main/res')
const arg = name => { const i = process.argv.indexOf(name); return i > -1 ? process.argv[i + 1] : null }
const fontPath = arg('--font')
const browser = arg('--browser') || [
  'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
].find(p => existsSync(p))
const sleep = ms => new Promise(r => setTimeout(r, ms))

const port = 9335
const proc = spawn(browser, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'floww-previews-'))}`, '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' })
let target
for (let i = 0; i < 50 && !target; i++) {
  try { target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(t => t.type === 'page') } catch {}
  if (!target) await sleep(200)
}
const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise(r => ws.addEventListener('open', r, { once: true }))
let seq = 0
const waiting = new Map()
ws.addEventListener('message', ev => { const m = JSON.parse(ev.data); waiting.get(m.id)?.(m); waiting.delete(m.id) })
const send = (method, params = {}) => new Promise(r => { const id = ++seq; waiting.set(id, r); ws.send(JSON.stringify({ id, method, params })) })
const evaluate = async expression => (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result?.result?.value

await send('Emulation.setDeviceMetricsOverride', { width: 900, height: 700, deviceScaleFactor: 3, mobile: false })
await send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } })
await send('Page.enable')
await send('Page.navigate', { url: pathToFileURL(join(root, 'scripts/widget-previews.html')).href })
await sleep(800)

if (fontPath) {
  const data = readFileSync(fontPath).toString('base64')
  await evaluate(`(async () => { const f = new FontFace('Widget Sans', 'url(data:font/ttf;base64,${data})', { weight: '100 900' }); await f.load(); document.fonts.add(f) })()`)
}

for (const theme of ['light', 'dark']) {
  await evaluate(`document.documentElement.dataset.theme = '${theme}'; document.fonts.ready.then(() => true)`)
  await sleep(200)
  const dir = join(res, theme === 'dark' ? 'drawable-night-nodpi' : 'drawable-nodpi')
  mkdirSync(dir, { recursive: true })
  for (const id of ['budget', 'left', 'spending']) {
    const box = await evaluate(`(() => { const r = document.getElementById('${id}').getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height } })()`)
    const shot = await send('Page.captureScreenshot', { format: 'png', clip: { ...box, scale: 1 } })
    writeFileSync(join(dir, `widget_preview_${id}.png`), Buffer.from(shot.result.data, 'base64'))
    console.log(theme, id, `${box.width}x${box.height}dp`)
  }
}

ws.close()
proc.kill()
