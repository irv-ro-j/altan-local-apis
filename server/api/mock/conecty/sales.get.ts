import { getSales } from '../../../utils/conecty'

export default defineEventHandler(async () => await getSales())
