import { resetSims } from '../../utils/mock'
export default defineEventHandler(() => ({ reset: true, sims: resetSims().length }))
