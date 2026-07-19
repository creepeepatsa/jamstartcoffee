import prisma from "../lib/prisma.js";
import axios from "axios";

function monthKeyUTC(dateValue) {
  const d = new Date(dateValue);
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

export async function getSalesTrend(req, res) {
  try {
    const { from, to } = req.analyticsQuery;

    const rows = await prisma.$queryRaw`
      SELECT
        date_trunc('month', date) AS month,
        SUM("totalSales")::float AS total_revenue,
        SUM(items_sold)::int AS total_units
      FROM "Sale"
      WHERE date >= ${from} AND date <= ${to}
      GROUP BY date_trunc('month', date)
      ORDER BY month ASC
    `;

    res.json({
      range: { from, to },
      trend: rows.map((r) => ({
        month: r.month,
        totalRevenue: r.total_revenue ?? 0,
        totalUnits: r.total_units ?? 0,
      })),
    });
  } catch (err) {
    console.error("getSalesTrend error:", err);
    res.status(500).json({ error: "Failed to load sales trend." });
  }
}


export async function getTopItems(req, res) {
  try {
    const { from, to, limit } = req.analyticsQuery;

    const rows = await prisma.$queryRaw`
      SELECT
        item_name,
        category,
        SUM(items_sold)::int AS units_sold,
        SUM("totalSales")::float AS revenue
      FROM "Sale"
      WHERE date >= ${from} AND date <= ${to}
      GROUP BY item_name, category
      ORDER BY revenue DESC
      LIMIT ${limit}
    `;

    res.json({
      range: { from, to },
      topItems: rows.map((r) => ({
        itemName: r.item_name,
        category: r.category,
        unitsSold: r.units_sold ?? 0,
        revenue: r.revenue ?? 0,
      })),
    });
  } catch (err) {
    console.error("getTopItems error:", err);
    res.status(500).json({ error: "Failed to load top items." });
  }
}


export async function getCategoryBreakdown(req, res) {
  try {
    const { from, to } = req.analyticsQuery;

    const rows = await prisma.$queryRaw`
      SELECT
        category,
        SUM(items_sold)::int AS units_sold,
        SUM("totalSales")::float AS revenue
      FROM "Sale"
      WHERE date >= ${from} AND date <= ${to}
      GROUP BY category
      ORDER BY revenue DESC
    `;

    res.json({
      range: { from, to },
      categories: rows.map((r) => ({
        category: r.category,
        unitsSold: r.units_sold ?? 0,
        revenue: r.revenue ?? 0,
      })),
    });
  } catch (err) {
    console.error("getCategoryBreakdown error:", err);
    res.status(500).json({ error: "Failed to load category breakdown." });
  }
}


export async function getKpiSummary(req, res) {
  try {
    const { from, to } = req.analyticsQuery;

    const totalsPromise = prisma.$queryRaw`
      SELECT
        SUM("totalSales")::float AS total_revenue,
        SUM(items_sold)::int AS total_units,
        COUNT(*)::int AS total_transactions
      FROM "Sale"
      WHERE date >= ${from} AND date <= ${to}
    `;

        const currentMonthStart = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), 1));
        const previousMonthStart = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth() - 1, 1));

    const momPromise = prisma.$queryRaw`
      SELECT
        date_trunc('month', date) AS month,
        SUM("totalSales")::float AS revenue
      FROM "Sale"
      WHERE date >= ${previousMonthStart} AND date <= ${to}
      GROUP BY date_trunc('month', date)
      ORDER BY month ASC
    `;

    const [totalsRows, momRows] = await Promise.all([totalsPromise, momPromise]);
    const totals = totalsRows[0] || {};

    const currentMonthKey = monthKeyUTC(currentMonthStart);
    const previousMonthKey = monthKeyUTC(previousMonthStart);

    const currentMonthRow = momRows.find((r) => monthKeyUTC(r.month) === currentMonthKey);
    const previousMonthRow = momRows.find((r) => monthKeyUTC(r.month) === previousMonthKey);

    const currentMonthRevenue = currentMonthRow?.revenue ?? 0;
    const previousMonthRevenue = previousMonthRow?.revenue ?? 0;

    let momChangePct = null;
    if (previousMonthRevenue > 0) {
      momChangePct =
        ((currentMonthRevenue - previousMonthRevenue) / previousMonthRevenue) * 100;
    }

    res.json({
      range: { from, to },
      totalRevenue: totals.total_revenue ?? 0,
      totalUnitsSold: totals.total_units ?? 0,
      totalTransactions: totals.total_transactions ?? 0,
      monthOverMonth: {
        currentMonth: currentMonthStart,
        currentMonthRevenue,
        previousMonth: previousMonthStart,
        previousMonthRevenue,
        changePct: momChangePct,
      },
    });
  } catch (err) {
    console.error("getKpiSummary error:", err);
    res.status(500).json({ error: "Failed to load KPI summary." });
  }
}

// ---------------------------------------------------------------------------
// GET /api/analytics/sales
// Filtered, paginated, sortable raw sales rows ("what happened" table view).
// ---------------------------------------------------------------------------
export async function getSalesTable(req, res) {
  try {
    const { from, to, page, pageSize, sortBy, sortOrder, item, category } =
      req.analyticsQuery;

    const where = {
      date: { gte: from, lte: to },
      ...(item ? { item_name: { contains: item, mode: "insensitive" } } : {}),
      ...(category ? { category: { contains: category, mode: "insensitive" } } : {}),
    };

    const [rows, total] = await Promise.all([
      prisma.sale.findMany({
        where,
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.sale.count({ where }),
    ]);

    res.json({
      range: { from, to },
      filters: { item: item ?? null, category: category ?? null },
      sort: { sortBy, sortOrder },
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
      data: rows,
    });
  } catch (err) {
    console.error("getSalesTable error:", err);
    res.status(500).json({ error: "Failed to load sales table." });
  }
}

// ---------------------------------------------------------------------------
// GET /api/analytics/forecast
// Calls the Python (FastAPI) forecasting microservice and returns predicted
// future sales. The Python service reads from the same "Sale" table directly.
// ---------------------------------------------------------------------------
const FORECAST_SERVICE_URL =
  process.env.FORECAST_SERVICE_URL || "http://localhost:8000";

export async function getSalesForecast(req, res) {
  try {
    const { monthsAhead = 3, category, item } = req.query;

    const parsedMonthsAhead = parseInt(monthsAhead, 10);
    if (isNaN(parsedMonthsAhead) || parsedMonthsAhead < 1 || parsedMonthsAhead > 24) {
      return res
        .status(400)
        .json({ error: "monthsAhead must be a number between 1 and 24." });
    }

    const { data } = await axios.get(`${FORECAST_SERVICE_URL}/forecast/sales`, {
      params: {
        months_ahead: parsedMonthsAhead,
        category: category || undefined,
        item_name: item || undefined,
      },
      timeout: 15000, // Prophet fitting can take a couple seconds
    });

    if (data.error) {
      return res.status(422).json({ error: data.error });
    }

    res.json(data);
  } catch (err) {
    if (err.code === "ECONNREFUSED") {
      console.error("getSalesForecast error: forecasting service is not running");
      return res.status(503).json({
        error: "Forecasting service is unavailable. Make sure the Python service is running.",
      });
    }

    console.error("getSalesForecast error:", err.message);
    res.status(500).json({ error: "Failed to generate sales forecast." });
  }
}

// ---------------------------------------------------------------------------
// GET /api/analytics/forecast-by-category
// Calls the Python forecasting microservice for a PER-CATEGORY breakdown of
// expected items sold. Each category comes back with its own history,
// forecast, and a "method" field ("prophet" or "simple_average") so the
// frontend can indicate which categories have a more/less reliable forecast.
// ---------------------------------------------------------------------------
export async function getItemsForecastByCategory(req, res) {
  try {
    const { monthsAhead = 3 } = req.query;

    const parsedMonthsAhead = parseInt(monthsAhead, 10);
    if (isNaN(parsedMonthsAhead) || parsedMonthsAhead < 1 || parsedMonthsAhead > 24) {
      return res
        .status(400)
        .json({ error: "monthsAhead must be a number between 1 and 24." });
    }

    const { data } = await axios.get(`${FORECAST_SERVICE_URL}/forecast/items-by-category`, {
      params: { months_ahead: parsedMonthsAhead },
      timeout: 20000, // multiple category models take longer than a single forecast
    });

    if (data.error) {
      return res.status(422).json({ error: data.error });
    }

    res.json(data);
  } catch (err) {
    if (err.code === "ECONNREFUSED") {
      console.error("getItemsForecastByCategory error: forecasting service is not running");
      return res.status(503).json({
        error: "Forecasting service is unavailable. Make sure the Python service is running.",
      });
    }

    console.error("getItemsForecastByCategory error:", err.message);
    res.status(500).json({ error: "Failed to generate items-by-category forecast." });
  }
}