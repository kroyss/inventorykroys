// Prueba local del comprobador de pagos (lib/conciliacionBanco.ts) con archivos reales, sin base ni pantalla.
// Uso: npx tsx scripts/conciliacion-prueba.ts pagos.csv estado1.xls [estado2.xlsx …]
// pagos.csv: id,venta,cuenta,banco_emisor,banco_receptor,metodo_pago,referencia,fecha_pago,monto_pagado,total_orden,verificacion
import { readFileSync } from 'fs'
import { cruzarPagos, leerEstadoCuenta, type PagoME } from '../lib/conciliacionBanco'

const [csv, ...archivos] = process.argv.slice(2)
const lineas = readFileSync(csv, 'utf-8').split(/\r?\n/)
const i = lineas.findIndex(l => l.startsWith('id,venta'))
const cab = lineas[i].split(',')
const pagos: (PagoME & { verificacion: string })[] = lineas.slice(i + 1).map(l => l.split(',')).filter(c => /^\d+$/.test(c[1] ?? ''))
  .map(c => Object.fromEntries(cab.map((k, j) => [k, c[j] ?? ''])))
  .map(r => ({ id: +r.id, venta: r.venta, banco_receptor: r.banco_receptor || null, metodo_pago: r.metodo_pago || null,
    referencia: r.referencia || null, fecha_pago: r.fecha_pago || null, monto_pagado: r.monto_pagado ? +r.monto_pagado : null,
    total_orden: r.total_orden ? +r.total_orden : null, verificacion: r.verificacion }))
const estados = archivos.map(f => leerEstadoCuenta(readFileSync(f), f))
for (const e of estados) console.log(`${e.banco}: ${e.movimientos.length} créditos de ${e.filas} filas, ${e.desde} → ${e.hasta}`)

const r = cruzarPagos(pagos, estados)
const cuenta = (pred: (x: typeof r.pagos[number]) => boolean) => r.pagos.filter(pred).length
console.log(`\n${r.pagos.length} pagos (${pagos.length} ventas)`)
for (const n of ['seguro', 'probable', 'revisar', 'no_aparece', 'sin_estado'] as const) console.log(`  ${n.padEnd(11)} ${cuenta(x => x.nivel === n)}`)
const juzgables = r.pagos.filter(x => x.nivel !== 'sin_estado')
const solos = juzgables.filter(x => x.nivel === 'seguro' || x.nivel === 'probable').length
console.log(`  → de los que tienen estado de cuenta: ${solos}/${juzgables.length} (${Math.round(solos * 100 / juzgables.length)} %) se resuelven solos`)
console.log(`  embalaje suelto: ${r.embalajeSuelto.length} · créditos sin venta: ${r.sinPago.length}`)
const porBanco = new Map<string, Record<string, number>>()
for (const x of r.pagos) { const b = x.ventas[0].banco_receptor ?? '(transferencia)'; const o = porBanco.get(b) ?? {}; o[x.nivel] = (o[x.nivel] ?? 0) + 1; porBanco.set(b, o) }
console.log('\nPor banco que dijo el comprador:'); for (const [b, o] of porBanco) console.log('  ', b.padEnd(16), JSON.stringify(o))
const verif = (x: typeof r.pagos[number]) => (x.ventas[0] as unknown as { verificacion: string }).verificacion
console.log('\nRevisar:'); r.pagos.filter(x => x.nivel === 'revisar').forEach(x => console.log('  ', x.ventas.map(v => v.venta).join('+'), '|', x.motivo))
console.log('\nNo aparece:'); r.pagos.filter(x => x.nivel === 'no_aparece').forEach(x => console.log('  ', x.ventas[0].venta, x.ventas[0].fecha_pago, x.ventas[0].banco_receptor, x.ventas[0].monto_pagado, verif(x)))
console.log('\nSeguros con banco distinto al declarado:'); r.pagos.filter(x => x.nivel === 'seguro' && x.motivo.includes('no a ')).forEach(x => console.log('  ', x.ventas[0].venta, x.motivo))
console.log('\nProbables (muestra):'); r.pagos.filter(x => x.nivel === 'probable').slice(0, 8).forEach(x => console.log('  ', x.ventas[0].venta, x.ventas[0].referencia, '→', x.mov?.ref, x.mov?.monto))
