import express from "express";

import {
  createSEOPlan,
  getSEOPlans,
  getSEOPlanById,
  updateSEOPlan,
  toggleSEOPlan,
  deleteSEO,

  assignSEO,

  getAllSEO,
  getSEOById,
  getClientSEO,

  addMonthlyTracking,
  updateMonthlyTracking,
  deleteMonthlyTracking,

  updateSEOStatus,
  addDailyTracking,
    getDailyTracking,
    updateDailyTracking,
    deleteDailyTracking,
} from "../controllers/seoController.js";

import {
  protect,
} from "../middleware/authMiddleware.js";

const router = express.Router();


/*
=====================================================
SEO PLANS
=====================================================
*/

router.post(
  "/plans",
  protect,
  createSEOPlan
);

router.get(
  "/plans",
  protect,
  getSEOPlans
);

router.get(
  "/plans/:id",
  protect,
  getSEOPlanById
);

router.put(
  "/plans/:id",
  protect,
  updateSEOPlan
);

router.patch(
  "/plans/:id/toggle",
  protect,
  toggleSEOPlan
);


/*
=====================================================
ASSIGN SEO
=====================================================
*/

router.post(
  "/assign",
  protect,
  assignSEO
);


/*
=====================================================
SEO RECORDS
=====================================================
*/

router.get(
  "/",
  protect,
  getAllSEO
);

router.get(
  "/client/:clientId",
  protect,
  getClientSEO
);

router.get(
  "/:id",
  protect,
  getSEOById
);


/*
=====================================================
MONTHLY TRACKING
=====================================================
*/

router.post(
  "/:id/monthly",
  protect,
  addMonthlyTracking
);

router.put(
  "/:id/monthly/:trackingId",
  protect,
  updateMonthlyTracking
);

router.delete(
  "/:id/monthly/:trackingId",
  protect,
  deleteMonthlyTracking
);


/*
=====================================================
DAILY TRACKING
=====================================================
*/

router.post(
  "/:id/daily",
  protect,
  addDailyTracking
);

router.get(
  "/:id/daily",
  protect,
  getDailyTracking
);

router.put(
  "/:id/daily/:trackingId",
  protect,
  updateDailyTracking
);

router.delete(
  "/:id/daily/:trackingId",
  protect,
  deleteDailyTracking
);

/*
=====================================================
STATUS
=====================================================
*/

router.patch(
  "/:id/status",
  protect,
  updateSEOStatus
);


router.delete(
  "/:id",
  protect,
  deleteSEO
);

export default router;