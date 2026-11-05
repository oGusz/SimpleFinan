// Gera todos os ícones do site e do app a partir de um único desenho.
// Uso: node scripts/generate-icons.mjs
//
// A marca é só geometria, sem fonte, para sair igual em qualquer computador.

import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const BACKGROUND = '#0d1117'
const EMERALD = '#10b981'
const TEXT = '#f8fafc'

const GRID = 512
const TILE_RADIUS = 112
const BARS = [
  { x: 120, y: 288, height: 112 },
  { x: 216, y: 208, height: 192 },
  { x: 312, y: 112, height: 288 },
]
const BAR_WIDTH = 80
const BAR_RADIUS = 16

function bars(color, scale = 1) {
  const shapes = BARS.map(
    ({ x, y, height }) =>
      `<rect x="${x}" y="${y}" width="${BAR_WIDTH}" height="${height}" rx="${BAR_RADIUS}" fill="${color}"/>`,
  ).join('')
  const offset = (GRID * (1 - scale)) / 2
  return `<g transform="translate(${offset} ${offset}) scale(${scale})">${shapes}</g>`
}

function svg({ size = GRID, background, radius = 0, color = EMERALD, scale = 1 }) {
  const tile = background
    ? `<rect width="${GRID}" height="${GRID}" rx="${radius}" fill="${background}"/>`
    : ''
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${GRID} ${GRID}">${tile}${bars(color, scale)}</svg>`
}

const roundedTile = (size) => svg({ size, background: BACKGROUND, radius: TILE_RADIUS })

// O sistema aplica a própria máscara nestes ícones, então o fundo precisa ir até a borda.
const fullBleed = (size, scale) => svg({ size, background: BACKGROUND, scale })

// Letras desenhadas com traço, em coordenadas com a linha de base em y=0.
const GLYPHS = {
  S: { width: 38, path: 'M36-54C32-62 24-64 18-64 8-64 2-58 2-49 2-38 12-35 19-32 28-29 38-26 38-15 38-6 30 0 19 0 11 0 4-3 0-10' },
  i: { width: 0, path: 'M0-40V0M0-60v.01' },
  m: { width: 48, path: 'M0 0V-40M0-26C0-36 6-40 13-40 20-40 24-36 24-27V0M24-27C24-36 30-40 37-40 44-40 48-36 48-27V0' },
  p: { width: 40, path: 'M0-40V22M0-20A20 20 0 1 1 40-20 20 20 0 1 1 0-20' },
  l: { width: 0, path: 'M0-64V0' },
  e: { width: 38, path: 'M1-20H38C38-32 31-40 20-40 9-40 1-31 1-20 1-8 9 0 20 0 28 0 34-3 37-9' },
  F: { width: 32, path: 'M0 0V-64H32M0-34H26' },
  n: { width: 30, path: 'M0 0V-40M0-25C0-35 7-40 15-40 24-40 30-35 30-25V0' },
  a: { width: 38, path: 'M38-40V0M38-20A19 20 0 1 1 0-20 19 20 0 1 1 38-20' },
}
const LETTER_GAP = 16

function wordmark(text) {
  let cursor = 0
  const paths = [...text].map((letter) => {
    const glyph = GLYPHS[letter]
    const path = `<path transform="translate(${cursor} 0)" d="${glyph.path}"/>`
    cursor += glyph.width + LETTER_GAP
    return path
  })
  return { markup: paths.join(''), width: cursor - LETTER_GAP }
}

function ogImage() {
  const width = 1200
  const height = 630
  const tile = 172
  const gap = 44
  const textScale = 1.34
  const word = wordmark('SimpleFinan')
  const total = tile + gap + word.width * textScale
  const left = (width - total) / 2
  const baseline = height / 2 + (64 * textScale) / 2

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" fill="${BACKGROUND}"/>
  <g transform="translate(${left} ${(height - tile) / 2}) scale(${tile / GRID})">
    <rect width="${GRID}" height="${GRID}" rx="${TILE_RADIUS}" fill="#161b22"/>
    ${bars(EMERALD)}
  </g>
  <g transform="translate(${left + tile + gap} ${baseline}) scale(${textScale})" fill="none" stroke="${TEXT}" stroke-width="9" stroke-linecap="round" stroke-linejoin="round">
    ${word.markup}
  </g>
</svg>`
}

// Opaco porque a App Store rejeita ícone com transparência.
const opaque = { background: BACKGROUND }

const PNGS = [
  { file: 'mobile/assets/icon.png', source: fullBleed(1024, 1), flatten: opaque },
  // A área segura do ícone adaptativo do Android é o círculo central de 66 dp em 108 dp.
  { file: 'mobile/assets/adaptive-icon.png', source: svg({ size: 1024, scale: 0.72 }) },
  // O Android usa só o canal alfa no ícone de notificação; por isso as barras ficam sem fundo.
  { file: 'mobile/assets/splash-icon.png', source: svg({ size: 1024, scale: 1.6 }) },
  { file: 'mobile/assets/favicon.png', source: roundedTile(48) },
  { file: 'public/icon-192.png', source: roundedTile(192) },
  { file: 'public/icon-512.png', source: roundedTile(512) },
  { file: 'public/icon-maskable-512.png', source: fullBleed(512, 0.85), flatten: opaque },
  { file: 'public/apple-icon.png', source: fullBleed(180, 1), flatten: opaque },
  // Em aba escura, o quadrado escuro sumiria no fundo: lá a cor se inverte.
  { file: 'public/icon-light-32x32.png', source: roundedTile(32) },
  {
    file: 'public/icon-dark-32x32.png',
    source: svg({ size: 32, background: EMERALD, radius: TILE_RADIUS, color: BACKGROUND }),
  },
  { file: 'public/og-image.png', source: ogImage(), flatten: opaque },
]

async function main() {
  await mkdir(join(ROOT, 'public/brand'), { recursive: true })
  await writeFile(join(ROOT, 'public/brand/logo.svg'), `${roundedTile(GRID)}\n`)
  await writeFile(join(ROOT, 'public/icon.svg'), `${roundedTile(GRID)}\n`)

  for (const { file, source, flatten } of PNGS) {
    let image = sharp(Buffer.from(source))
    if (flatten) image = image.flatten(flatten).removeAlpha()
    await image.png({ compressionLevel: 9 }).toFile(join(ROOT, file))
    const { width, height, hasAlpha } = await sharp(join(ROOT, file)).metadata()
    console.log(`${file}: ${width}x${height}${hasAlpha ? ', com transparência' : ''}`)
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
