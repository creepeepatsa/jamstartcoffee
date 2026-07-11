// routes/analytics.routes.js
//
// Mount in your app with:
//   import analyticsRoutes from "./routes/analyticsRoutes.js";
//   app.use("/api/analytics", analyticsRoutes);
//
// Endpoints: /salesTrend, /topItems, /categoryBreakdown, /kpiSummary, /sales
//
// All routes are GET — this router is purely for reading/summarizing existing
// Sale records, no mutations.

import express from "express";
import {
  getSalesTrend,
  getTopItems,
  getCategoryBreakdown,
  getKpiSummary,
  getSalesTable,
} from "../controllers/analyticsController.js";
import { validateAnalyticsQuery } from "../middleware/analyticsMiddleware.js";

const router = express.Router();

// If you have auth middleware already (e.g. requireAuth, requireRole("Admin")),
// add it here, e.g.: router.use(requireAuth);

router.get("/salesTrend", validateAnalyticsQuery, getSalesTrend);
router.get("/topItems", validateAnalyticsQuery, getTopItems);
router.get("/categoryBreakdown", validateAnalyticsQuery, getCategoryBreakdown);
router.get("/kpiSummary", validateAnalyticsQuery, getKpiSummary);
router.get("/sales", validateAnalyticsQuery, getSalesTable);

export default router;