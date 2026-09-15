const fs = require('node:fs')
const path = require('node:path')

const sharpModule = process.env.SHARP_MODULE || 'sharp'
const sharp = require(sharpModule)
const publicDir = path.resolve(__dirname, '../public')
const source = path.join(publicDir, 'marca-jms.svg')

function buildIco(images) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(images.length, 4)
  const directory = Buffer.alloc(images.length * 16)
  let offset = header.length + directory.length
  images.forEach(({ size, buffer }, index) => {
    const entry = index * 16
    directory.writeUInt8(size === 256 ? 0 : size, entry)
    directory.writeUInt8(size === 256 ? 0 : size, entry + 1)
    directory.writeUInt8(0, entry + 2)
    directory.writeUInt8(0, entry + 3)
    directory.writeUInt16LE(1, entry + 4)
    directory.writeUInt16LE(32, entry + 6)
    directory.writeUInt32LE(buffer.length, entry + 8)
    directory.writeUInt32LE(offset, entry + 12)
    offset += buffer.length
  })
  return Buffer.concat([header, directory, ...images.map(image => image.buffer)])
}

async function main() {
  const sizes = [16, 32, 48, 180, 192, 512]
  const images = new Map()
  for (const size of sizes) {
    const buffer = await sharp(source).resize(size, size).png().toBuffer()
    images.set(size, buffer)
    if (size !== 48) fs.writeFileSync(path.join(publicDir, `favicon-${size}x${size}.png`), buffer)
  }
  fs.writeFileSync(path.join(publicDir, 'favicon.ico'), buildIco(
    [16, 32, 48].map(size => ({ size, buffer: images.get(size) })),
  ))
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
