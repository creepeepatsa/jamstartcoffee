// routes/analytics.routes.js

import express from "express";
import {
  getSalesTrend,
  getTopItems,
  getCategoryBreakdown,
  getKpiSummary,
  getSalesTable,
  getSalesForecast,
  getItemsForecastByCategory,
  getPretrainedForecast,   // <-- new
} from "../controllers/analyticsController.js";
import { validateAnalyticsQuery } from "../middleware/analyticsMiddleware.js";

const router = express.Router();

router.get("/salesTrend", validateAnalyticsQuery, getSalesTrend);
router.get("/topItems", validateAnalyticsQuery, getTopItems);
router.get("/categoryBreakdown", validateAnalyticsQuery, getCategoryBreakdown);
router.get("/kpiSummary", validateAnalyticsQuery, getKpiSummary);
router.get("/sales", validateAnalyticsQuery, getSalesTable);
router.get("/forecast", getSalesForecast);
router.get("/forecast-by-category", getItemsForecastByCategory);
router.get("/forecast-pretrained/:key", getPretrainedForecast);   // <-- new

export default router;