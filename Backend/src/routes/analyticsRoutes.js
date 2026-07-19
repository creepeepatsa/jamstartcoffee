// routes/analytics.routes.js — add the missing import and route

import express from "express";
import {
  getSalesTrend,
  getTopItems,
  getCategoryBreakdown,
  getKpiSummary,
  getSalesTable,
  getSalesForecast,
  getItemsForecastByCategory,   // <-- was missing
} from "../controllers/analyticsController.js";
import { validateAnalyticsQuery } from "../middleware/analyticsMiddleware.js";

const router = express.Router();

router.get("/salesTrend", validateAnalyticsQuery, getSalesTrend);
router.get("/topItems", validateAnalyticsQuery, getTopItems);
router.get("/categoryBreakdown", validateAnalyticsQuery, getCategoryBreakdown);
router.get("/kpiSummary", validateAnalyticsQuery, getKpiSummary);
router.get("/sales", validateAnalyticsQuery, getSalesTable);
router.get("/forecast", getSalesForecast);
router.get("/forecast-by-category", getItemsForecastByCategory);   // <-- was missing

export default router;