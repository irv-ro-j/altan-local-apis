import { getStore } from './runtime-storage'
import { randomInt } from 'node:crypto'
import { changeSubscriberNumber, manualSim, provisionSim, MSISDN_PATTERN } from '../lib/sim-data'
import type { MockSim } from '../lib/sim-data'
import { DuplicateKeyError, StorageConflictError } from '../lib/storage'

export { activatePlan, changePlan, consumeBenefits, crtLinkageFor, operationResult, profileFor, purchasePackage, setOfferLifecycleType, STATUS_OPTIONS, MSISDN_PATTERN } from '../lib/sim-data'
export type { MockSim, OfferLifecycleType } from '../lib/sim-data'

export async function getSims() {
  return (await getStore().list<MockSim>('sims')).sort((a, b) => a.msisdn.localeCompare(b.msisdn))
}
export async function addSim(msisdn: string, status: string, isCrtLinked = false) {
  const sim = manualSim(msisdn, status, isCrtLinked)
  return await getStore().create([{ collection: 'sims', key: msisdn, value: sim }]) ? sim : undefined
}
export async function removeSim(msisdn: string) {
  return await getStore().delete('sims', msisdn)
}

// A profile lookup never provisions a SIM, including after a cold start.
export async function findSim(msisdn: string) {
  if (msisdn === '5550000098') throw createError({ statusCode: 500, data: { errorCode: 'LOCAL_500', message: 'Simulated Altán error' } })
  if (msisdn === '5550000099') return undefined
  return await getStore().get<MockSim>('sims', msisdn)
}

export async function updateSim(msisdn: string, status: 'Idle' | 'Active', change: (sim: MockSim) => void, operation: 'port_in' | 'change_nir' = 'port_in') {
  if (!MSISDN_PATTERN.test(msisdn)) throw createError({ statusCode: 400, data: { message: 'El MSISDN debe tener 10 dígitos.' } })
  if (msisdn === '5550000098') throw createError({ statusCode: 500, data: { errorCode: 'LOCAL_500', message: 'Simulated Altán error' } })
  if (msisdn === '5550000099') throw createError({ statusCode: 404, data: { errorCode: '1211000305', message: 'Subscriber not found' } })
  try {
    return await getStore().update('sims', msisdn, () => provisionSim(msisdn, status), change, sim => sim.msisdn)
  } catch (error) {
    if (error instanceof DuplicateKeyError) throw createError({ statusCode: 409, data: {
      errorCode: operation === 'change_nir' ? 'LOCAL_NIR_CONFLICT' : 'LOCAL_PORT_IN_CONFLICT',
      message: operation === 'change_nir' ? 'The assigned MSISDN already exists. Retry the NIR change.' : 'The ported MSISDN already exists.'
    } })
    if (error instanceof StorageConflictError) throw createError({ statusCode: 409, data: { message: error.message } })
    throw error
  }
}

export async function changeNir(msisdn: string, zone: string, msisdnType: string) {
  let newMsisdn: string
  do {
    newMsisdn = `${zone}${String(randomInt(0, 1_000_000_000)).padStart(9, '0')}`
  } while (newMsisdn === msisdn)
  await updateSim(msisdn, 'Active', sim => changeSubscriberNumber(sim, zone, msisdnType, newMsisdn), 'change_nir')
  return { oldMsisdn: msisdn, newMsisdn }
}

export async function portIn(transitory: string, ported: string) {
  const effectiveDate = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')
  await updateSim(transitory, 'Active', (sim) => {
    if (sim.status !== 'Active') throw createError({ statusCode: 409, data: { errorCode: 'LOCAL_PORT_IN_NOT_ACTIVE', message: 'Port-in requires an Active transitory SIM.' } })
    sim.msisdn = ported
    sim.operations.push({ type: 'port_in', at: effectiveDate })
  })
  return { msisdnPorted: ported, effectiveDate }
}
