import { resetSims } from '../../utils/mock'
import { resetSales } from '../../utils/conecty'

export default defineEventHandler(() => { resetSales(); return { reset: true, sims: resetSims().length } })
