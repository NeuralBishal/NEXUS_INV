import { Router, type IRouter } from "express";
import healthRouter from "./health";
import inventoryRouter from "./inventory";
import uploadRouter from "./upload";

const router: IRouter = Router();

router.use(healthRouter);
router.use(inventoryRouter);
router.use(uploadRouter);

export default router;
