import { getSims } from '../../utils/mock'
export default defineEventHandler(() => getSims().map(({ imsi, imei, benefits, operations, ...sim }) => {
  const total = (marker: string) => benefits.filter(item => item.name.includes(marker)).reduce((sum, item) => sum + item.remaining, 0)
  return { ...sim, validity: benefits[0]?.expireDate || null, benefitCount: benefits.length, balances: { data: total('DATA'), voice: total('MIN'), sms: total('SMS') } }
}))
