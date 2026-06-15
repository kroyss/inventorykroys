// Codemod único: enruta todos los catch 500 (`String(err)`) por el helper
// apiError() para que queden registrados en los logs. Idempotente.
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(process.cwd(), 'app', 'api')
const TARGET = 'NextResponse.json({ error: String(err) }, { status: 500 })'
const REPLACE = 'apiError(err)'
const IMPORT = "import { apiError } from '@/lib/apiError'"

function walk(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...walk(p))
    else if (name.endsWith('.ts')) out.push(p)
  }
  return out
}

let changed = 0
for (const file of walk(ROOT)) {
  let src = readFileSync(file, 'utf8')
  if (!src.includes(TARGET)) continue
  src = src.replaceAll(`return ${TARGET}`, `return ${REPLACE}`)
  // por si quedara alguno sin `return ` delante
  src = src.replaceAll(TARGET, REPLACE)
  if (!src.includes("from '@/lib/apiError'")) {
    const lines = src.split('\n')
    const idx = lines.findIndex(l => l.includes("from 'next/server'"))
    lines.splice(idx + 1, 0, IMPORT)
    src = lines.join('\n')
  }
  writeFileSync(file, src)
  changed++
  console.log('  ✓ ' + file.replace(process.cwd(), '.'))
}
console.log(`\n${changed} endpoints actualizados.`)
