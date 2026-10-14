// Builds the app icons from build/icon.svg:
//   build/icon.png (1024), build/icon.ico (PNG-embedded, 16-256), build/icon.icns (PNG entries),
//   resources/icon.png (copy of the 1024 PNG).
// Run with: node scripts/run-electron-node.cjs scripts/make-icons.cjs  (plain `node` works too)
const { readFileSync, writeFileSync, mkdirSync, copyFileSync } = require('node:fs')
const { join } = require('node:path')
const sharp = require('sharp')

const root = join(__dirname, '..')
const buildDir = join(root, 'build')
const svg = readFileSync(join(buildDir, 'icon.svg'))

const png = (size) => sharp(svg, { density: Math.max(72, Math.ceil((72 * size) / 1024) * 4) }).resize(size, size).png().toBuffer()

/** ICO container with PNG-compressed entries (supported since Windows Vista). */
function makeIco(images) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0) // reserved
  header.writeUInt16LE(1, 2) // type: icon
  header.writeUInt16LE(images.length, 4)
  const dir = Buffer.alloc(16 * images.length)
  let offset = 6 + dir.length
  images.forEach(({ size, data }, i) => {
    const o = i * 16
    dir.writeUInt8(size >= 256 ? 0 : size, o) // width (0 = 256)
    dir.writeUInt8(size >= 256 ? 0 : size, o + 1) // height
    dir.writeUInt8(0, o + 2) // palette colours
    dir.writeUInt8(0, o + 3) // reserved
    dir.writeUInt16LE(1, o + 4) // colour planes
    dir.writeUInt16LE(32, o + 6) // bits per pixel
    dir.writeUInt32LE(data.length, o + 8)
    dir.writeUInt32LE(offset, o + 12)
    offset += data.length
  })
  return Buffer.concat([header, dir, ...images.map((i) => i.data)])
}

/** ICNS container with PNG entries. */
function makeIcns(entries) {
  const chunks = entries.map(({ type, data }) => {
    const h = Buffer.alloc(8)
    h.write(type, 0, 'ascii')
    h.writeUInt32BE(data.length + 8, 4)
    return Buffer.concat([h, data])
  })
  const body = Buffer.concat(chunks)
  const h = Buffer.alloc(8)
  h.write('icns', 0, 'ascii')
  h.writeUInt32BE(body.length + 8, 4)
  return Buffer.concat([h, body])
}

async function main() {
  mkdirSync(buildDir, { recursive: true })
  const big = await png(1024)
  writeFileSync(join(buildDir, 'icon.png'), big)

  const icoSizes = [16, 32, 48, 64, 128, 256]
  const ico = makeIco(await Promise.all(icoSizes.map(async (size) => ({ size, data: await png(size) }))))
  writeFileSync(join(buildDir, 'icon.ico'), ico)

  const icns = makeIcns([
    { type: 'ic07', data: await png(128) },
    { type: 'ic08', data: await png(256) },
    { type: 'ic09', data: await png(512) },
    { type: 'ic10', data: big }
  ])
  writeFileSync(join(buildDir, 'icon.icns'), icns)

  mkdirSync(join(root, 'resources'), { recursive: true })
  copyFileSync(join(buildDir, 'icon.png'), join(root, 'resources', 'icon.png'))
  console.log('Icons written to build/ and resources/icon.png')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
