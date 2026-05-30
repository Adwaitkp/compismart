import { Router } from 'express'
import analyzeRoutes from './analyze'
import chatRoutes from './chat'

const router = Router()

router.use('/analyze', analyzeRoutes)
router.use('/chat', chatRoutes)

export default router
