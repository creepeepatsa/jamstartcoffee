// middleware/validateAnalyticsQuery.js
//
// Parses and sanitizes query params shared across analytics endpoints:
// date range (from/to), pagination (page/pageSize), sorting (sortBy/sortOrder),
// and free-text filters (item, category). Attaches the normalized result to
// req.analyticsQuery so controllers never touch raw req.query directly.

const ALLOWED_SORT_FIELDS = new Set([
  "date",
  "item_name",
  "category",
  "net_price",
  "items_sold",
  "totalSales",
]);

const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 20;

function parseDate(value, fallback) {
  if (!value) return fallback;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function validateAnalyticsQuery(req, res, next) {
  const now = new Date();

  // Default range: start of this month one year ago -> now.
  const defaultFrom = new Date(now.getFullYear() - 1, now.getMonth(), 1);
  const defaultTo = now;

  const from = parseDate(req.query.from, defaultFrom);
  const to = parseDate(req.query.to, defaultTo);

  if (from === null || to === null) {
    return res.status(400).json({
      error: "Invalid 'from' or 'to' date. Use ISO format, e.g. 2026-01-01.",
    });
  }

  if (from > to) {
    return res.status(400).json({ error: "'from' must be before 'to'." });
  }

  let page = parseInt(req.query.page, 10);
  if (!Number.isInteger(page) || page < 1) page = 1;

  let pageSize = parseInt(req.query.pageSize, 10);
  if (!Number.isInteger(pageSize) || pageSize < 1) pageSize = DEFAULT_PAGE_SIZE;
  if (pageSize > MAX_PAGE_SIZE) pageSize = MAX_PAGE_SIZE;

  let sortBy = req.query.sortBy;
  if (!ALLOWED_SORT_FIELDS.has(sortBy)) sortBy = "date";

  let sortOrder = String(req.query.sortOrder || "desc").toLowerCase();
  if (sortOrder !== "asc" && sortOrder !== "desc") sortOrder = "desc";

  let limit = parseInt(req.query.limit, 10);
  if (!Number.isInteger(limit) || limit < 1) limit = 10;
  if (limit > MAX_PAGE_SIZE) limit = MAX_PAGE_SIZE;

  req.analyticsQuery = {
    from,
    to,
    page,
    pageSize,
    sortBy,
    sortOrder,
    limit,
    item: req.query.item ? String(req.query.item) : undefined,
    category: req.query.category ? String(req.query.category) : undefined,
  };

  next();
}