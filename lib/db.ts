import { Pool } from 'pg'

const poolVE = new Pool({
  connectionString: process.env.DATABASE_URL_VE,
})

const poolCO = new Pool({
  connectionString: process.env.DATABASE_URL_CO,
})

export function getDb(country: 'VE' | 'CO') {
  return country === 'VE' ? poolVE : poolCO
}
