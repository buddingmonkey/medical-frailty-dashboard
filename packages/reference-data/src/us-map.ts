// The state shapes for the home map (roadmap M3 step 2), built once from us-atlas 3.0.1
// (Census Bureau cartographic boundaries 1:10m, already projected with d3's Albers USA to a
// 975 x 610 box; ISC licence, public-domain data). The browser and the server get plain SVG
// path strings, so neither ships d3 or TopoJSON.
//
// `pnpm --filter @mfcd/reference-data us-map` writes packages/shared/src/us-map.json;
// src/us-map.test.ts fails if that file no longer matches this builder.
import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'

import { geoPath } from 'd3-geo'
import { feature } from 'topojson-client'

export const US_MAP_FILE = join(import.meta.dirname, '..', '..', 'shared', 'src', 'us-map.json')

type Topology = Parameters<typeof feature>[0]

export interface UsMapStateShape {
  /** Two-letter postal code (`states.id`). */
  id: string
  /** Two-digit FIPS code (`states.fips`). */
  fips: string
  name: string
  /** SVG path in the 975 x 610 box, 0.1 px precision. */
  d: string
  /** Area-weighted centre, for markers and labels. */
  cx: number
  cy: number
}

/** FIPS → USPS code, as in apps/api/migrations/0003_seed_states.sql (the 50 states and DC). */
export const POSTAL_BY_FIPS: Readonly<Record<string, string>> = {
  '01': 'AL', // Alabama
  '02': 'AK', // Alaska
  '04': 'AZ', // Arizona
  '05': 'AR', // Arkansas
  '06': 'CA', // California
  '08': 'CO', // Colorado
  '09': 'CT', // Connecticut
  '10': 'DE', // Delaware
  '11': 'DC', // District of Columbia
  '12': 'FL', // Florida
  '13': 'GA', // Georgia
  '15': 'HI', // Hawaii
  '16': 'ID', // Idaho
  '17': 'IL', // Illinois
  '18': 'IN', // Indiana
  '19': 'IA', // Iowa
  '20': 'KS', // Kansas
  '21': 'KY', // Kentucky
  '22': 'LA', // Louisiana
  '23': 'ME', // Maine
  '24': 'MD', // Maryland
  '25': 'MA', // Massachusetts
  '26': 'MI', // Michigan
  '27': 'MN', // Minnesota
  '28': 'MS', // Mississippi
  '29': 'MO', // Missouri
  '30': 'MT', // Montana
  '31': 'NE', // Nebraska
  '32': 'NV', // Nevada
  '33': 'NH', // New Hampshire
  '34': 'NJ', // New Jersey
  '35': 'NM', // New Mexico
  '36': 'NY', // New York
  '37': 'NC', // North Carolina
  '38': 'ND', // North Dakota
  '39': 'OH', // Ohio
  '40': 'OK', // Oklahoma
  '41': 'OR', // Oregon
  '42': 'PA', // Pennsylvania
  '44': 'RI', // Rhode Island
  '45': 'SC', // South Carolina
  '46': 'SD', // South Dakota
  '47': 'TN', // Tennessee
  '48': 'TX', // Texas
  '49': 'UT', // Utah
  '50': 'VT', // Vermont
  '51': 'VA', // Virginia
  '53': 'WA', // Washington
  '54': 'WV', // West Virginia
  '55': 'WI', // Wisconsin
  '56': 'WY', // Wyoming
}

const round = (n: number) => Math.round(n * 10) / 10

export function buildUsMap(topology: Topology): {
  width: number
  height: number
  states: UsMapStateShape[]
} {
  const states = topology.objects['states']
  if (!states) throw new Error('us-atlas: no "states" object')
  const collection = feature(topology, states)
  if (collection.type !== 'FeatureCollection')
    throw new Error('us-atlas: states is not a collection')
  const path = geoPath().digits(1)
  const shapes = collection.features.map((f): UsMapStateShape => {
    const props: unknown = f.properties
    const name =
      typeof props === 'object' &&
      props !== null &&
      'name' in props &&
      typeof props.name === 'string'
        ? props.name
        : ''
    const d = path(f)
    if (typeof f.id !== 'string' || !/^\d{2}$/.test(f.id) || name === '' || d === null) {
      throw new Error(`us-atlas: unexpected feature ${String(f.id)}`)
    }
    const id = POSTAL_BY_FIPS[f.id]
    if (id === undefined) throw new Error(`us-atlas: no postal code for FIPS ${f.id}`)
    const [cx, cy] = path.centroid(f)
    return { id, fips: f.id, name, d, cx: round(cx), cy: round(cy) }
  })
  shapes.sort((a, b) => a.fips.localeCompare(b.fips))
  return { width: 975, height: 610, states: shapes }
}

export function readUsAtlas(): Topology {
  const require = createRequire(import.meta.url)
  return JSON.parse(
    readFileSync(require.resolve('us-atlas/states-albers-10m.json'), 'utf8'),
  ) as Topology
}

export function usMapJson(): string {
  return `${JSON.stringify(buildUsMap(readUsAtlas()), null, 1)}\n`
}

if (process.argv[1] === import.meta.filename) {
  writeFileSync(US_MAP_FILE, usMapJson())
  console.log(`wrote ${US_MAP_FILE}`)
}
