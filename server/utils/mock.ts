export type BenefitBucket = { name: string, offeringId: string, total: number, remaining: number, effectiveDate: string, expireDate: string }
export type MockSim = { msisdn: string, iccid: string, imsi: string, imei: string, status: string, label: string, description: string, offerId: string, benefits: BenefitBucket[], operations: { type: string, at: string, offeringId?: string }[] }
const dateFormat = (date: Date) => date.toISOString().replace(/\.\d{3}Z$/, 'Z')
function dateInDays (days: number) { const date = new Date(); date.setUTCDate(date.getUTCDate() + days); return dateFormat(date) }
function primaryBenefits (offeringId: string): BenefitBucket[] {
  const effectiveDate = dateFormat(new Date())
  const expireDate = dateInDays(30)
  return [
    { name: 'FU_DATA_ALTAN_RN_CT', offeringId, total: 5120, remaining: 5120, effectiveDate, expireDate },
    { name: 'FU_MIN_ALTAN', offeringId, total: 1500, remaining: 1500, effectiveDate, expireDate },
    { name: 'FU_SMS_ALTAN_NR_LDI_NA', offeringId, total: 500, remaining: 500, effectiveDate, expireDate }
  ]
}
function purchasedDataBenefit (offeringId: string): BenefitBucket {
  return { name: 'FU_DATA_ALTAN_RN_CT', offeringId, total: 1024, remaining: 1024, effectiveDate: dateFormat(new Date()), expireDate: dateInDays(30) }
}
const initialSims: MockSim[] = [
  ['5550000001', 'Idle', 'Inactiva', 'SIM disponible para preactivar o activar'], ['5550000002', 'Active', 'Activa', 'Línea activa para recargas y cambio de plan'], ['5550000003', 'Suspend (B2W)', 'Suspendida', 'Línea suspendida'], ['5550000004', 'Suspend (B2W) (By IMEI locked)', 'Suspendida por IMEI', 'Línea suspendida por IMEI bloqueado'], ['5550000005', 'Suspend (B2W) (Notified by client)', 'Suspendida por cliente', 'Suspensión solicitada por cliente'], ['5550000006', 'Barring (B1W)', 'Restricción B1W', 'Restricción de llamadas y mensajes'], ['5550000007', 'Barring (B1W) (By NoB28)', 'Restricción NoB28', 'Restricción por no ser B28'], ['5550000008', 'Barring (B1W) (Notified by client)', 'Restricción por cliente', 'Restricción solicitada por cliente'], ['5550000009', 'Predeactive', 'Predesactivada v1', 'Línea predesactivada'], ['5550000010', 'Predeactivate', 'Predesactivada v2', 'Línea predesactivada sin servicio'], ['5550000011', 'Deactive', 'Desactivada', 'Línea desactivada']
].map(([msisdn, status, label, description], index) => ({ msisdn, status, label, description, iccid: `89521400000000000${String(index + 1).padStart(2, '0')}`, imsi: `33414000000000${String(index + 1).padStart(2, '0')}`, imei: `3500000000000${String(index + 1).padStart(2, '0')}`, offerId: '1000000001', benefits: status === 'Active' ? primaryBenefits('1000000001') : [], operations: [] })) as MockSim[]
declare global { var __altanLocalSims: MockSim[] | undefined }
function cloneFixtures () { return structuredClone(initialSims) }
export function getSims () { return globalThis.__altanLocalSims ??= cloneFixtures() }
export function resetSims () { globalThis.__altanLocalSims = cloneFixtures(); return getSims() }
export function requireSim (msisdn: string) { if (msisdn === '5550000099' || !getSims().some(sim => sim.msisdn === msisdn)) throw createError({ statusCode: 404, data: { errorCode: '1211000305', message: 'Subscriber not found' } }); if (msisdn === '5550000098') throw createError({ statusCode: 500, data: { errorCode: 'LOCAL_500', message: 'Simulated Altán error' } }); return getSims().find(sim => sim.msisdn === msisdn)! }
export function activatePlan (sim: MockSim, offeringId: string, operation: 'activate' | 'preregister') { sim.status = 'Active'; sim.offerId = offeringId; sim.benefits = primaryBenefits(offeringId); sim.operations.push({ type: operation, offeringId, at: dateFormat(new Date()) }) }
export function purchasePackage (sim: MockSim, offeringId: string) { sim.benefits.push(purchasedDataBenefit(offeringId)); sim.operations.push({ type: 'purchase', offeringId, at: dateFormat(new Date()) }) }
export function changePlan (sim: MockSim, offeringId: string) { sim.offerId = offeringId; sim.benefits = primaryBenefits(offeringId); sim.operations.push({ type: 'change_offer', offeringId, at: dateFormat(new Date()) }) }
export function consumeBenefits (sim: MockSim, usage = { data: 250, voice: 60, sms: 20 }) {
  const kinds = [{ marker: 'DATA', amount: usage.data }, { marker: 'MIN', amount: usage.voice }, { marker: 'SMS', amount: usage.sms }]
  for (const kind of kinds) {
    let remaining = kind.amount
    for (const bucket of sim.benefits.filter(item => item.name.includes(kind.marker)).sort((a, b) => a.expireDate.localeCompare(b.expireDate))) {
      const used = Math.min(bucket.remaining, remaining)
      bucket.remaining -= used
      remaining -= used
      if (!remaining) break
    }
  }
  sim.operations.push({ type: 'consume', at: dateFormat(new Date()) })
}
export function profileFor (sim: MockSim) { return { responseSubscriber: { information: { idSubscriber: `LOCAL-${sim.msisdn}`, IMSI: sim.imsi, ICCID: sim.iccid, IMEI: sim.imei, coordinates: null }, status: { subStatus: sim.status }, primaryOffering: { offeringId: sim.offerId, excessiveProductSpeed: '1024' }, freeUnits: sim.benefits.map(bucket => ({ name: bucket.name, freeUnit: { totalAmt: String(bucket.total), unusedAmt: String(bucket.remaining) }, detailOfferings: [{ offeringId: bucket.offeringId, effectiveDate: bucket.effectiveDate, expireDate: bucket.expireDate }] })) } } }
export function operationResult (type: string, sim: MockSim, offerId?: string) { return { order: { id: `LOCAL-${crypto.randomUUID()}` }, status: 'completed', operation: type, msisdn: sim.msisdn, offeringId: offerId || null, environment: 'LOCAL', profileValidity: sim.benefits[0]?.expireDate || null } }
