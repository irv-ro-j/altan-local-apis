import { getSims } from '../../utils/mock'
import { getStore } from '../../utils/runtime-storage'

export default defineEventHandler(async () => {
  await getStore().reset()
  return { reset: true, sims: (await getSims()).length }
})
