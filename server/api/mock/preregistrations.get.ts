import { getPreregistrationBatches } from '../../utils/preregistration-batch'

export default defineEventHandler(async () => await getPreregistrationBatches())
