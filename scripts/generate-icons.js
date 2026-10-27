// Script para gerar ícones PWA como SVGs (sem dependências externas)
// Os SVGs serão usados como ícones até que imagens reais sejam adicionadas

const fs = require('fs')
const path = require('path')

const publicDir = path.join(__dirname, 'public')

// Gera SVG com as iniciais "SF" em fundo escuro
function generateSVG(size, text = 'SF') {
  const fontSize = Math.floor(size * 0.38)
  const borderRadius = Math.floor(size * 0.22)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${borderRadius}" ry="${borderRadius}" fill="#0d1117"/>
  <rect width="${size}" height="${size}" rx="${borderRadius}" ry="${borderRadius}" fill="url(#grad)" opacity="0.8"/>
  <defs>
    <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#10b981;stop-opacity:0.3" />
      <stop offset="100%" style="stop-color:#059669;stop-opacity:0.1" />
    </linearGradient>
  </defs>
  <text x="50%" y="50%" dominant-baseline="central" text-anchor="middle"
    font-family="system-ui, -apple-system, sans-serif"
    font-weight="800"
    font-size="${fontSize}"
    fill="#10b981"
    letter-spacing="-1">${text}</text>
</svg>`
}

const icons = [
  { name: 'icon-192.png', size: 192 },
  { name: 'icon-512.png', size: 512 },
  { name: 'apple-touch-icon.png', size: 180 },
]

icons.forEach(({ name, size }) => {
  // Salva como SVG mas com extensão .png — browsers de PWA aceitam SVGs como ícones
  // Para produção real, substitua por PNGs gerados por um designer
  const svgContent = generateSVG(size)
  const svgName = name.replace('.png', '.svg')
  fs.writeFileSync(path.join(publicDir, svgName), svgContent)
  console.log(`✅ Gerado: ${svgName} (${size}x${size})`)
})

console.log('\n⚠️  Os ícones foram gerados como SVG.')
console.log('Para iPhone, substitua por PNGs reais em public/ com os mesmos nomes.')

