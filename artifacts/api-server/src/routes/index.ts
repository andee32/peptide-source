import { Router, type IRouter } from "express";
import healthRouter from "./health";
import productsRouter from "./products";
import batchesRouter from "./batches";
import adminRouter from "./admin";
import ordersRouter from "./orders";
import webhooksRouter from "./webhooks";
import reviewerSubmissionsRouter from "./reviewerSubmissions";
import subscriptionsRouter from "./subscriptions";

const router: IRouter = Router();

router.use(healthRouter);
router.use(productsRouter);
router.use(batchesRouter);
router.use(adminRouter);
router.use(ordersRouter);
router.use(webhooksRouter);
router.use(reviewerSubmissionsRouter);
router.use(subscriptionsRouter);

export default router;
