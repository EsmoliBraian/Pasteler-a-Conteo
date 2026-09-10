// Genera los íconos PWA (PNG) sin dependencias externas: dibuja pixel a pixel
// y codifica un PNG crudo (IHDR + IDAT deflate + IEND) usando solo `zlib` de Node.
import { deflateSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii')
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const crcBuf = Buffer.alloc(4)
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0)
  return Buffer.concat([len, typeBuf, data, crcBuf])
}

function encodePNG(width, height, pixelFn) {
  const raw = Buffer.alloc((width * 4 + 1) * height)
  let offset = 0
  for (let y = 0; y < height; y++) {
    raw[offset++] = 0 // filter: none
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = pixelFn(x, y)
      raw[offset++] = r
      raw[offset++] = g
      raw[offset++] = b
      raw[offset++] = a
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // color type RGBA
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0
  const idat = deflateSync(raw, { level: 9 })
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  return Buffer.concat([signature, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))])
}

// Paleta: fondo ambar (bakery/caja), moneda blanca al centro.
const BG = [180, 83, 9] // #b45309
const COIN = [255, 251, 245]
const COIN_EDGE = [217, 119, 6]

function mix(c1, c2, t) {
  return [
    Math.round(c1[0] + (c2[0] - c1[0]) * t),
    Math.round(c1[1] + (c2[1] - c1[1]) * t),
    Math.round(c1[2] + (c2[2] - c1[2]) * t),
  ]
}

function drawIcon({ size, padding, squareBg }) {
  const cx = size / 2
  const cy = size / 2
  const coinR = size * (0.5 - padding) * 0.62
  const ringR = coinR * 0.78
  return (x, y) => {
    const dx = x - cx
    const dy = y - cy
    const dist = Math.sqrt(dx * dx + dy * dy)
    const edgeAA = Math.max(0, Math.min(1, coinR + 1 - dist))

    if (dist <= coinR + 1) {
      let color = COIN
      // anillo interior de la moneda
      const ringDist = Math.abs(dist - ringR)
      if (ringDist < size * 0.022) color = COIN_EDGE
      // trazo vertical central, tipo "$" simplificado (sin ganchos, solo la barra)
      const barW = coinR * 0.15
      if (Math.abs(dx) < barW * 0.5 && Math.abs(dy) < coinR * 0.5) color = COIN_EDGE
      const rgb = dist > coinR - 1 ? mix(BG, color, edgeAA) : color
      return [...rgb, 255]
    }
    if (squareBg) return [...BG, 255]
    return [...BG, 255]
  }
}

const outDir = new URL('../public/icons/', import.meta.url)

const targets = [
  { name: 'icon-192.png', size: 192, padding: 0.06 },
  { name: 'icon-512.png', size: 512, padding: 0.06 },
  { name: 'icon-512-maskable.png', size: 512, padding: 0.16 },
  { name: 'apple-touch-icon.png', size: 180, padding: 0.1 },
]

for (const t of targets) {
  const png = encodePNG(t.size, t.size, drawIcon({ size: t.size, padding: t.padding, squareBg: true }))
  writeFileSync(new URL(t.name, outDir), png)
  console.log('generado', t.name)
}
