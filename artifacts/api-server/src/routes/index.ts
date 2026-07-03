import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import storageRouter from "./storage";
import profileRouter from "./profile";
import loansRouter from "./loans";
import notificationsRouter from "./notifications";
import adminRouter from "./admin";
import virtualCardsRouter from "./virtualCards";
import withdrawalsRouter from "./withdrawals";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(storageRouter);
router.use(profileRouter);
router.use(loansRouter);
router.use(notificationsRouter);
router.use(adminRouter);
router.use(virtualCardsRouter);
router.use(withdrawalsRouter);

export default router;
