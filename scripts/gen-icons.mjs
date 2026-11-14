import { createRequire } from 'node:module'
import { readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
const root = process.argv[2] || process.cwd()
const require = createRequire(join(root, 'package.json'))
const sharp = require('sharp')
const res = join(root, 'src-capacitor/android/app/src/main/res')

const HUE = '#1d5fbf'
const wave = (cx, cy, w, sw) => {
  const s = w / 16.8
  const x0 = cx - 8.4 * s, y0 = cy - 3 * s
  return `<path transform="translate(${x0} ${y0}) scale(${s})" d="M0 0c2.2 0 2.2 6 4.4 6s2.2-6 4.4-6 2.2 6 4.4 6 2.2-6 2.8-6" fill="none" stroke="#fff" stroke-width="${sw / s}" stroke-linecap="round" stroke-linejoin="round"/>`
}
const iconSvg = (size, round) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  ${round ? `<circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="${HUE}"/>` : `<rect width="${size}" height="${size}" rx="${size * 0.22}" fill="${HUE}"/>`}
  ${wave(size / 2, size / 2, size * 0.56, size * 0.085)}
</svg>`

const densities = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 }
for (const [d, px] of Object.entries(densities)) {
  const dir = join(res, `mipmap-${d}`)
  await sharp(Buffer.from(iconSvg(px, false))).png().toFile(join(dir, 'ic_launcher.png'))
  await sharp(Buffer.from(iconSvg(px, true))).png().toFile(join(dir, 'ic_launcher_round.png'))
  const fg = Math.round(px * 108 / 48)
  await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${fg}" height="${fg}">${wave(fg / 2, fg / 2, fg * 0.42, fg * 0.062)}</svg>`)).png().toFile(join(dir, 'ic_launcher_foreground.png'))
  if (existsSync(join(dir, 'ic_launcher_background.png'))) {
    await sharp({ create: { width: fg, height: fg, channels: 4, background: HUE } }).png().toFile(join(dir, 'ic_launcher_background.png'))
  }
}

const { writeFileSync } = await import('node:fs')
const favicons = {}
for (const px of [16, 32, 96, 128]) {
  favicons[px] = await sharp(Buffer.from(iconSvg(px, false))).png().toBuffer()
  writeFileSync(join(root, 'public/icons', `favicon-${px}x${px}.png`), favicons[px])
}
const icoSizes = [16, 32]
const header = Buffer.alloc(6 + 16 * icoSizes.length)
header.writeUInt16LE(0, 0)
header.writeUInt16LE(1, 2)
header.writeUInt16LE(icoSizes.length, 4)
let offset = header.length
icoSizes.forEach((px, i) => {
  const at = 6 + 16 * i
  header.writeUInt8(px, at)
  header.writeUInt8(px, at + 1)
  header.writeUInt16LE(1, at + 4)
  header.writeUInt16LE(32, at + 6)
  header.writeUInt32LE(favicons[px].length, at + 8)
  header.writeUInt32LE(offset, at + 12)
  offset += favicons[px].length
})
writeFileSync(join(root, 'public/favicon.ico'), Buffer.concat([header, ...icoSizes.map(px => favicons[px])]))

const nightDir = dir => dir.replace(/^drawable(-land|-port)?/, (m, o) => `drawable${o || ''}-night`)
const { renameSync, mkdirSync } = await import('node:fs')

for (const dir of readdirSync(res).filter(n => n.startsWith('drawable') && !n.includes('night'))) {
  const f = join(res, dir, 'splash.png')
  if (!existsSync(f)) continue
  const { width, height } = await sharp(f).metadata()
  const m = Math.round(Math.min(width, height) * 0.16)
  for (const [target, ground] of [[join(res, dir), '#f2f4f7'], [join(res, nightDir(dir)), '#0e0f11']]) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
      <rect width="100%" height="100%" fill="${ground}"/>
      <g transform="translate(${(width - m) / 2} ${(height - m) / 2})">
        <rect width="${m}" height="${m}" rx="${m * 0.28}" fill="${HUE}"/>
        ${wave(m / 2, m / 2, m * 0.6, m * 0.085)}
      </g>
    </svg>`
    mkdirSync(target, { recursive: true })
    const out = join(target, 'splash.png')
    await sharp(Buffer.from(svg)).png().toFile(out + '.tmp')
    renameSync(out + '.tmp', out)
  }
  console.log('splash', dir, nightDir(dir), width, height)
}
console.log('done')
