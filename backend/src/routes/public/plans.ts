import { Router } from 'express';
import { listPublicPlans } from '../../shared/plans.js';

export function publicPlansRouter(): Router {
  const router = Router();

  // GET /public/plans (and /v1/public/plans)
  router.get('/plans', (_req, res) => {
    const plans = listPublicPlans();
    res.json({
      data: {
        plans,
      },
    });
  });

  return router;
}
