// controllers/analytics.controller.js
//
// Read-only analytics over the Sale table (Prisma). Every handler here is a
// GET — no writes. Raw SQL is used only where Prisma's query builder can't
// express date-truncated grouping (monthly trends); everything else uses
// the Prisma client directly.
//
// Adjust the import path below to wherever your prisma.js singleton lives.
import prisma from "../lib/prisma.js";

// ---------------------------------------------------------------------------
// GET /api/analytics/sales-trend
// Monthly totals over time: revenue + units sold per month, within range.
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// GET /api/analytics/top-items
// Top-selling items by revenue within range, with category attached.
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// GET /api/analytics/category-breakdown
// Revenue + units grouped by category within range.
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// GET /api/analytics/kpi-summary
// Total revenue, total units sold (in range), plus month-over-month % change
// comparing the most recent full/partial month in range vs the one before it.
// ---------------------------------------------------------------------------
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

    // Last two calendar months relative to "to", for MoM comparison.
    const currentMonthStart = new Date(to.getFullYear(), to.getMonth(), 1);
    const previousMonthStart = new Date(to.getFullYear(), to.getMonth() - 1, 1);

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

    const currentMonthRow = momRows.find(
      (r) => new Date(r.month).getTime() === currentMonthStart.getTime()
    );
    const previousMonthRow = momRows.find(
      (r) => new Date(r.month).getTime() === previousMonthStart.getTime()
    );

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