import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { conEmpresa, dbGlobal } from '@/lib/db'
import { cupoIA } from '@/lib/ia'
import type { Country } from '@/lib/types'
import { enTandas, soloDueno } from '@/lib/plataforma'
import { currentDate } from '@/lib/tz'

// 12-11 (el dueño): el consumo se mide desde que salió Mi IA (06-11); lo de antes eran otros modelos y otro diseño.
// 12-11 (corrección del dueño): Mi IA salió OFICIALMENTE el 11-11 (del 06 al 10 fueron pruebas de su equipo, con
// Sonnet). Por defecto se mide desde el 11-11; se puede ver desde el 06-11 como historial.
export const IA_MEDIR_DESDE = '2026-11-11'
const IA_HISTORIAL_DESDE = '2026-11-06'

// GET /api/plataforma/uso-ia → consumo de IA de cada empresa desde IA_MEDIR_DESDE, por día, módulo, modelo y usuario
// (migración 065), y los créditos de cada empresa. Solo el dueño de la plataforma (funciones SECURITY DEFINER).
// 12-11 (el dueño): "tener a detalle el consumo de cada cuenta en todo lo que consuma" →
//   · detalle SIN el corte de créditos (plataforma_ia_costo_detalle, mig. 169): para lo que se paga cuenta todo;
//   · la Ayuda (burbuja del manual, ayuda_consultas) entra como módulo 'ayuda' de la empresa del usuario;
//   · ?desde=AAAA-MM-DD (no antes de IA_MEDIR_DESDE) para ver solo desde ayer, hoy, etc.;
//   · cuadre: ia_gasto (cada llamada pagada a Anthropic, mig. 169) contra lo asignado desde que existe el registro.
export async function GET(req: NextRequest) {
  const { error } = await soloDueno()
  if (error) return error
  try {
    const pedido = req.nextUrl.searchParams.get('desde') ?? ''
    const desde = /^\d{4}-\d{2}-\d{2}$/.test(pedido) && pedido >= IA_HISTORIAL_DESDE ? pedido : IA_MEDIR_DESDE
    const [{ rows: detalle }, { rows: empresas }, { rows: ayuda }, { rows: gasto }] = await Promise.all([
      dbGlobal().query(
        `SELECT empresa_id, to_char(dia, 'YYYY-MM-DD') AS dia, modulo, modelo, usuario, usos,
                entrada::float AS entrada, salida::float AS salida, busquedas::float AS busquedas, costo::float AS costo
         FROM plataforma_ia_costo_detalle($1::date) ORDER BY dia`, [desde]),
      dbGlobal().query(
        `SELECT e.id, e.nombre, e.country, o.estado = 'propietario' AS propietario, e.ia_limite_mes AS limite
         FROM empresas e JOIN organizaciones o ON o.id = e.organizacion_id ORDER BY e.id`),
      dbGlobal().query(
        `SELECT COALESCE(a.empresa_id, -2) AS empresa_id, to_char((a.created_at AT TIME ZONE 'America/Caracas')::date, 'YYYY-MM-DD') AS dia,
                'ayuda' AS modulo, COALESCE(a.modelo, '?') AS modelo, COALESCE(u.full_name, u.username, 'Sin usuario') AS usuario,
                COUNT(*)::int AS usos, SUM(a.entrada)::float AS entrada, SUM(a.salida)::float AS salida, 0::float AS busquedas,
                SUM(a.costo)::float AS costo
         FROM ayuda_consultas a LEFT JOIN users u ON u.id = a.user_id
         WHERE a.created_at >= ($1::date::timestamp AT TIME ZONE 'America/Caracas')
         GROUP BY 1, 2, 3, 4, 5`, [desde]),
      dbGlobal().query(
        // ia_gasto_para (mig. 170) trae el motivo; ia_gasto (mig. 169) son las primeras horas, sin motivo.
        `SELECT to_char(dia, 'YYYY-MM-DD') AS dia, modelo, tipo, para, llamadas, fallidas, costo::float AS costo, primera
         FROM ia_gasto_para WHERE dia >= $1::date
         UNION ALL
         SELECT to_char(dia, 'YYYY-MM-DD'), modelo, tipo, 'Sin detalle (primeras horas del registro)', llamadas, fallidas, costo::float, primera
         FROM ia_gasto WHERE dia >= $1::date
         ORDER BY 1`, [desde]).catch(() => ({ rows: [] })),
    ])
    detalle.push(...ayuda)
    // Cuadre: desde la PRIMERA llamada anotada en ia_gasto (el registro empezó el 12-11 a media jornada).
    let cuadre: { desde: string; pagado: number; internas: number; asignado: number; asignadoInternas: number; fallidas: number } | null = null
    if (gasto.length) {
      const inicio = gasto.reduce((m, g) => (new Date(g.primera) < m ? new Date(g.primera) : m), new Date(gasto[0].primera))
      const [{ rows: asig }, { rows: [ay] }] = await Promise.all([
        dbGlobal().query(`SELECT tipo, costo::float AS costo FROM plataforma_ia_asignado($1)`, [inicio]),
        dbGlobal().query(`SELECT COALESCE(SUM(costo), 0)::float AS costo FROM ayuda_consultas WHERE created_at >= $1`, [inicio]),
      ])
      cuadre = {
        desde: inicio.toISOString(),
        pagado: gasto.filter(g => g.tipo !== 'interna').reduce((a, g) => a + g.costo, 0),
        internas: gasto.filter(g => g.tipo === 'interna').reduce((a, g) => a + g.costo, 0),
        asignado: (asig.find(r => r.tipo === 'cuenta')?.costo ?? 0) + ay.costo,
        asignadoInternas: asig.find(r => r.tipo === 'interna')?.costo ?? 0,
        fallidas: gasto.reduce((a, g) => a + g.fallidas, 0),
      }
    }
    // Créditos: los mismos que ve el cliente (cupoIA). Clientes (mig. 156): usados desde el cambio a saldo, de todo lo
    // recibido (prueba + primer plan + recargas); la propietaria, del mes.
    // De a UNA empresa con conEmpresa (devuelve la conexión al terminar con ella). NUNCA dbEmpresa en un
    // bucle: retiene una conexión por empresa hasta el final del request y con más empresas que
    // conexiones del pool (10) trababa la copia entera (13-10: "Interno no sirve", Plataforma paralizada).
    // 12-11: solo las que usaron la IA en el período (las demás no se muestran) y de a 4 a la vez (antes de a una: 2,4 s).
    const conUso = new Set(detalle.map(d => d.empresa_id))
    await enTandas(empresas.filter(e => conUso.has(e.id)), async e => {
      const c = await conEmpresa(e.id, e.country as Country, db => cupoIA(db, e.id)).catch(() => null)
      e.creditos = c?.usados ?? null
      if (c) e.limite = c.limite
    })
    const hoy = currentDate()
    const dias = Math.round((Date.parse(hoy) - Date.parse(desde)) / 864e5) + 1
    return NextResponse.json({ desde, dias, detalle, empresas, cuadre, gasto: gasto.map(g => ({ dia: g.dia, modelo: g.modelo, tipo: g.tipo, para: g.para, llamadas: g.llamadas, fallidas: g.fallidas, costo: g.costo })) })
  } catch (err) {
    return apiError(err)
  }
}
