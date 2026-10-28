import { getPreregistrationBatch } from '../../../utils/preregistration-batch'

export default defineEventHandler(async (event) => {
  const batch = await getPreregistrationBatch(getRouterParam(event, 'transactionId') || '')
  if (!batch) throw createError({ statusCode: 404, data: { message: 'Preregistration batch not found' } })
  return batch
})
