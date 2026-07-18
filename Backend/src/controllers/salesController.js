import { parse } from 'csv-parse/sync';
import ExcelJS from 'exceljs';
import crypto from 'crypto';
import prisma from '../lib/prisma.js';

const parseMonthRange = (monthValue) => {
  if (!monthValue) return null;

  const match = /^([0-9]{4})-([0-9]{2})$/.exec(monthValue);
  if (!match) return null;

  const year = Number(match[1]);
  const monthIndex = Number(match[2]);

  if (monthIndex < 1 || monthIndex > 12) return null;

  const startDate = new Date(Date.UTC(year, monthIndex - 1, 1));
  const endDate = new Date(Date.UTC(year, monthIndex, 1));

  return { startDate, endDate };
};

const parseImportedDate = (rawValue) => {
  if (rawValue === null || rawValue === undefined) return null;

  if (rawValue instanceof Date && !Number.isNaN(rawValue.getTime())) {
    return new Date(Date.UTC(rawValue.getUTCFullYear(), rawValue.getUTCMonth(), rawValue.getUTCDate()));
  }

  const value = String(rawValue).trim();
  if (!value) return null;

  // Strict YYYY-MM-DD (from CSV exports/inputs)
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (isoMatch) {
    const year = Number(isoMatch[1]);
    const month = Number(isoMatch[2]);
    const day = Number(isoMatch[3]);
    return new Date(Date.UTC(year, month - 1, day));
  }

  // Common spreadsheet format MM/DD/YYYY
  const slashMatch = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value);
  if (slashMatch) {
    const month = Number(slashMatch[1]);
    const day = Number(slashMatch[2]);
    const year = Number(slashMatch[3]);
    return new Date(Date.UTC(year, month - 1, day));
  }

  // Fallback for textual dates; normalize to UTC date-only to avoid timezone drift.
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;

  return new Date(Date.UTC(parsed.getFullYear(), parsed.getMonth(), parsed.getDate()));
};

const REQUIRED_COLUMNS = ['Date', 'Item Name', 'Category', 'Net Price', 'Items Sold', 'Total Sales'];
const MAX_ROWS_PER_IMPORT = 50000; // sanity ceiling — prevents a bad/huge file from freezing the server

export const importSales = async (req, res) => {
  try {
    // ── File presence check ──────────────────────────────
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    if (req.file.size === 0) {
      return res.status(400).json({ error: 'Uploaded file is empty' });
    }

    // ── Duplicate file check ──────────────────────────────
    // Hash the file's actual content (not just its name) — this catches
    // the exact same file even if it's been renamed, while still allowing
    // a genuinely different/updated file that happens to share a filename.
    const fileHash = crypto.createHash('sha256').update(req.file.buffer).digest('hex');

    const existingImport = await prisma.importLog.findUnique({
      where: { fileHash },
    });

    if (existingImport) {
      return res.status(409).json({
        error: `This exact file was already imported on ${existingImport.importedAt.toISOString().split('T')[0]} (as "${existingImport.filename}")`,
      });
    }

    const ext = req.file.originalname.slice(req.file.originalname.lastIndexOf('.')).toLowerCase();
    let rows = [];

    // ── Parse ──────────────────────────────
    try {
      if (ext === '.csv') {
        rows = parse(req.file.buffer, {
          columns: true,
          skip_empty_lines: true,
          trim: true,
        });
      } else {
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(req.file.buffer);
        const worksheet = workbook.worksheets[0];

        if (!worksheet) {
          return res.status(400).json({ error: 'Excel file has no worksheet' });
        }

        const headers = [];
        worksheet.getRow(1).eachCell((cell, colNumber) => {
          headers[colNumber] = cell.text.trim();
        });

        worksheet.eachRow((row, rowNumber) => {
          if (rowNumber === 1) return;
          const rowData = {};
          row.eachCell((cell, colNumber) => {
            const header = headers[colNumber];
            rowData[header] = header === 'Date' ? cell.value : cell.text.trim();
          });
          rows.push(rowData);
        });
      }
    } catch (parseError) {
      return res.status(400).json({ error: 'Could not parse file — check it is a valid CSV/Excel file' });
    }

    // ── Structural validation: does the file actually have data? ──
    if (rows.length === 0) {
      return res.status(400).json({ error: 'File contains no data rows' });
    }

    if (rows.length > MAX_ROWS_PER_IMPORT) {
      return res.status(400).json({
        error: `File has ${rows.length} rows, which exceeds the ${MAX_ROWS_PER_IMPORT} row limit per import. Split it into smaller files.`,
      });
    }

    // ── Structural validation: are the required columns present? ──
    // Check this once against the first row's keys, instead of discovering
    // it's missing 904 times over in the per-row loop below.
    const actualColumns = Object.keys(rows[0]);
    const missingColumns = REQUIRED_COLUMNS.filter((col) => !actualColumns.includes(col));

    if (missingColumns.length > 0) {
      return res.status(400).json({
        error: `File is missing required column(s): ${missingColumns.join(', ')}`,
        expectedColumns: REQUIRED_COLUMNS,
        foundColumns: actualColumns,
      });
    }

    // ── Per-row validation ──────────────────────────────
    const validRows = [];
    const failedRows = [];

    for (const [index, row] of rows.entries()) {
      const rowNumber = index + 2; // +2 accounts for header row + 0-index
      const rowErrors = [];

      const item_name = row['Item Name']?.trim();
      const category = row['Category']?.trim();
      const date = parseImportedDate(row['Date']);
      const net_price = parseFloat(row['Net Price']);
      const items_sold = parseInt(row['Items Sold'], 10);
      const totalSales = parseFloat(row['Total Sales']);

      if (!item_name) rowErrors.push('Item Name is missing');
      if (!category) rowErrors.push('Category is missing');
      if (!date || Number.isNaN(date.getTime())) rowErrors.push('Date is invalid or missing');

      if (isNaN(net_price)) {
        rowErrors.push('Net Price is not a valid number');
      } else if (net_price < 0) {
        rowErrors.push('Net Price cannot be negative');
      }

      if (isNaN(items_sold)) {
        rowErrors.push('Items Sold is not a valid number');
      } else if (items_sold < 0) {
        rowErrors.push('Items Sold cannot be negative');
      } else if (!Number.isInteger(items_sold)) {
        rowErrors.push('Items Sold must be a whole number');
      }

      if (isNaN(totalSales)) {
        rowErrors.push('Total Sales is not a valid number');
      } else if (totalSales < 0) {
        rowErrors.push('Total Sales cannot be negative');
      }

      // Business-logic sanity check — not a hard rejection, but flag rows where
      // reported Total Sales is wildly inconsistent with Net Price × Items Sold
      // (helps catch typos in the client's raw data, e.g. a misplaced decimal)
      if (rowErrors.length === 0) {
        const expectedTotal = net_price * items_sold;
        const tolerance = expectedTotal * 0.05; // allow 5% variance for rounding
        if (Math.abs(expectedTotal - totalSales) > tolerance && expectedTotal > 0) {
          rowErrors.push(
            `Total Sales (${totalSales}) doesn't match Net Price × Items Sold (expected ~${expectedTotal.toFixed(2)})`
          );
        }
      }

      if (rowErrors.length > 0) {
        failedRows.push({ row: rowNumber, reasons: rowErrors });
        continue;
      }

      validRows.push({ date, item_name, category, net_price, items_sold, totalSales });
    }

    // ── Insert ──────────────────────────────
    if (validRows.length > 0) {
      await prisma.sale.createMany({ data: validRows });
    }

    // Record this file's hash so re-uploading the exact same file gets caught next time
    await prisma.importLog.create({
      data: {
        filename: req.file.originalname,
        fileHash,
        rowCount: validRows.length,
        importedBy: req.user?.email || 'unknown',
      },
    });

    await prisma.log.create({
      data: {
        name: req.user?.email || 'unknown',
        action: `Imported ${validRows.length}/${rows.length} sales rows from ${req.file.originalname}`,
      },
    });

    res.status(200).json({
      message: validRows.length > 0 ? 'Import completed' : 'Import completed with no valid rows',
      totalRows: rows.length,
      inserted: validRows.length,
      failed: failedRows.length,
      failedRows: failedRows.slice(0, 50), // cap response size for very messy files
    });
  } catch (error) {
    console.error('Import error:', error);
    res.status(500).json({ error: 'Failed to import file' });
  }
};

// ── Report builders ──────────────────────────────
// Each report type has its own shape, so export just needs a {columns, rows}
// pair — columns drive both the XLSX header row and CSV header line, keyed
// the same way so a single writer can handle every report type below.

const REPORT_TYPES = ['sales_report', 'mom_report', 'yoy_report', 'category_performance', 'item_performance'];

const monthKey = (date) => `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;

const monthLabel = (key) => {
  const [year, month] = key.split('-');
  const asDate = new Date(Date.UTC(Number(year), Number(month) - 1, 1));
  return asDate.toLocaleString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
};

const pctChange = (current, previous) => {
  if (!previous) return null;
  return ((current - previous) / previous) * 100;
};

const buildSalesReport = (sales) => ({
  columns: [
    { header: 'Date', key: 'date', width: 15 },
    { header: 'Item Name', key: 'item_name', width: 25 },
    { header: 'Category', key: 'category', width: 20 },
    { header: 'Net Price', key: 'net_price', width: 12 },
    { header: 'Items Sold', key: 'items_sold', width: 12 },
    { header: 'Total Sales', key: 'totalSales', width: 15 },
  ],
  rows: sales.map((sale) => ({
    date: sale.date.toISOString().split('T')[0],
    item_name: sale.item_name,
    category: sale.category,
    net_price: sale.net_price,
    items_sold: sale.items_sold,
    totalSales: sale.totalSales,
  })),
});

const buildMoMReport = (sales) => {
  const byMonth = new Map();

  for (const sale of sales) {
    const key = monthKey(sale.date);
    const existing = byMonth.get(key) || { totalSales: 0, items_sold: 0 };
    existing.totalSales += sale.totalSales;
    existing.items_sold += sale.items_sold;
    byMonth.set(key, existing);
  }

  const sortedKeys = [...byMonth.keys()].sort();

  const rows = sortedKeys.map((key, index) => {
    const current = byMonth.get(key);
    const previous = index > 0 ? byMonth.get(sortedKeys[index - 1]) : null;
    const change = previous ? pctChange(current.totalSales, previous.totalSales) : null;

    return {
      month: monthLabel(key),
      totalSales: Number(current.totalSales.toFixed(2)),
      items_sold: current.items_sold,
      momChangePct: change === null ? 'N/A' : `${change.toFixed(1)}%`,
    };
  });

  return {
    columns: [
      { header: 'Month', key: 'month', width: 15 },
      { header: 'Total Sales', key: 'totalSales', width: 15 },
      { header: 'Items Sold', key: 'items_sold', width: 12 },
      { header: 'MoM Change', key: 'momChangePct', width: 12 },
    ],
    rows,
  };
};

// month (YYYY-MM), if given, narrows WHICH calendar month to compare across
// years — it should not restrict the query to a single year, so exportSales
// deliberately skips applying it as a date-range filter for this report type.
const buildYoYReport = (sales, month) => {
  const monthOfYear = month ? Number(month.slice(5, 7)) : null;
  const byYear = new Map();

  for (const sale of sales) {
    if (monthOfYear && sale.date.getUTCMonth() + 1 !== monthOfYear) continue;

    const year = sale.date.getUTCFullYear();
    const existing = byYear.get(year) || { totalSales: 0, items_sold: 0 };
    existing.totalSales += sale.totalSales;
    existing.items_sold += sale.items_sold;
    byYear.set(year, existing);
  }

  const sortedYears = [...byYear.keys()].sort((a, b) => a - b);

  const rows = sortedYears.map((year, index) => {
    const current = byYear.get(year);
    const previous = index > 0 ? byYear.get(sortedYears[index - 1]) : null;
    const change = previous ? pctChange(current.totalSales, previous.totalSales) : null;

    return {
      period: monthOfYear ? monthLabel(`${year}-${String(monthOfYear).padStart(2, '0')}`) : String(year),
      totalSales: Number(current.totalSales.toFixed(2)),
      items_sold: current.items_sold,
      yoyChangePct: change === null ? 'N/A' : `${change.toFixed(1)}%`,
    };
  });

  return {
    columns: [
      { header: monthOfYear ? 'Period' : 'Year', key: 'period', width: 15 },
      { header: 'Total Sales', key: 'totalSales', width: 15 },
      { header: 'Items Sold', key: 'items_sold', width: 12 },
      { header: 'YoY Change', key: 'yoyChangePct', width: 12 },
    ],
    rows,
  };
};

const buildCategoryPerformance = async (where) => {
  const grouped = await prisma.sale.groupBy({
    by: ['category'],
    where,
    _sum: { totalSales: true, items_sold: true },
    orderBy: { _sum: { totalSales: 'desc' } },
  });

  return {
    columns: [
      { header: 'Category', key: 'category', width: 20 },
      { header: 'Total Sales', key: 'totalSales', width: 15 },
      { header: 'Items Sold', key: 'items_sold', width: 12 },
    ],
    rows: grouped.map((g) => ({
      category: g.category,
      totalSales: Number((g._sum.totalSales || 0).toFixed(2)),
      items_sold: g._sum.items_sold || 0,
    })),
  };
};

const buildItemPerformance = async (where) => {
  const grouped = await prisma.sale.groupBy({
    by: ['item_name', 'category'],
    where,
    _sum: { totalSales: true, items_sold: true },
    orderBy: { _sum: { totalSales: 'desc' } },
  });

  return {
    columns: [
      { header: 'Item Name', key: 'item_name', width: 25 },
      { header: 'Category', key: 'category', width: 20 },
      { header: 'Total Sales', key: 'totalSales', width: 15 },
      { header: 'Items Sold', key: 'items_sold', width: 12 },
    ],
    rows: grouped.map((g) => ({
      item_name: g.item_name,
      category: g.category,
      totalSales: Number((g._sum.totalSales || 0).toFixed(2)),
      items_sold: g._sum.items_sold || 0,
    })),
  };
};

export const exportSales = async (req, res) => {
  try {
    const { startDate, endDate, month, category, format = 'csv', reportType = 'sales_report' } = req.query;

    // ── Validate reportType ──────────────────────────────
    if (!REPORT_TYPES.includes(reportType)) {
      return res
        .status(400)
        .json({ error: `Invalid reportType "${reportType}". Must be one of: ${REPORT_TYPES.join(', ')}` });
    }

    // ── Validate format ──────────────────────────────
    const allowedFormats = ['csv', 'xlsx'];
    if (!allowedFormats.includes(format)) {
      return res.status(400).json({ error: `Invalid format "${format}". Must be one of: ${allowedFormats.join(', ')}` });
    }

    // ── Validate date range ──────────────────────────────
    let parsedStart, parsedEnd;
    let monthMode = false;

    const monthRange = parseMonthRange(month);
    if (month && !monthRange) {
      return res.status(400).json({ error: 'Invalid month — use YYYY-MM format' });
    }

    // YoY compares the same calendar month across every year in the data, so
    // treating `month` as a hard date-range filter would wrongly collapse it
    // to a single year. Every other report type applies it normally.
    if (monthRange && reportType !== 'yoy_report') {
      parsedStart = monthRange.startDate;
      parsedEnd = monthRange.endDate;
      monthMode = true;
    }

    if (startDate) {
      parsedStart = new Date(startDate);
      if (isNaN(parsedStart.getTime())) {
        return res.status(400).json({ error: 'Invalid startDate — use YYYY-MM-DD format' });
      }
    }

    if (endDate) {
      parsedEnd = new Date(endDate);
      if (isNaN(parsedEnd.getTime())) {
        return res.status(400).json({ error: 'Invalid endDate — use YYYY-MM-DD format' });
      }
    }

    if (parsedStart && parsedEnd && parsedStart > parsedEnd) {
      return res.status(400).json({ error: 'startDate cannot be after endDate' });
    }

    const where = {};
    if (parsedStart || parsedEnd) {
      where.date = {};
      if (parsedStart) where.date.gte = parsedStart;
      if (parsedEnd) where.date[monthMode ? 'lt' : 'lte'] = parsedEnd;
    }
    if (category) {
      where.category = category;
    }

    // ── Build report ──────────────────────────────
    let columns;
    let rows;

    if (reportType === 'category_performance') {
      ({ columns, rows } = await buildCategoryPerformance(where));
    } else if (reportType === 'item_performance') {
      ({ columns, rows } = await buildItemPerformance(where));
    } else {
      // sales_report, mom_report, and yoy_report all start from the raw matching rows
      const sales = await prisma.sale.findMany({ where, orderBy: { date: 'asc' } });

      if (sales.length === 0) {
        return res.status(404).json({ error: 'No sales records match the given filters' });
      }

      if (reportType === 'mom_report') {
        ({ columns, rows } = buildMoMReport(sales));
      } else if (reportType === 'yoy_report') {
        ({ columns, rows } = buildYoYReport(sales, month));
      } else {
        ({ columns, rows } = buildSalesReport(sales));
      }
    }

    // ── Validate there's actually something to export ──────────────────────────────
    if (!rows || rows.length === 0) {
      return res.status(404).json({ error: 'No sales records match the given filters' });
    }

    if (format === 'xlsx') {
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet('Report');
      sheet.columns = columns;
      rows.forEach((row) => sheet.addRow(row));

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=${reportType}.xlsx`);
      await workbook.xlsx.write(res);
      res.end();
    } else {
      const header = columns.map((c) => c.header).join(',') + '\n';
      const csvRows = rows.map((row) => columns.map((c) => row[c.key]).join(',')).join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=${reportType}.csv`);
      res.send(header + csvRows);
    }

    await prisma.log.create({
      data: {
        name: req.user?.email || 'unknown',
        action: `Exported ${reportType} report (${rows.length} rows, ${format})`,
      },
    });
  } catch (error) {
    console.error('Export error:', error);
    res.status(500).json({ error: 'Failed to export data' });
  }
};

export const getSalesTable = async (req, res) => {
  try {
    const { startDate, endDate, month, category, item, page = 1, limit = 50 } = req.query;

    const where = {};

    const monthRange = parseMonthRange(month);
    if (month && !monthRange) {
      return res.status(400).json({ error: 'Invalid month — use YYYY-MM format' });
    }

    if (monthRange) {
      where.date = {
        gte: monthRange.startDate,
        lt: monthRange.endDate,
      };
    }

    if (startDate) {
      const parsedStart = new Date(startDate);
      if (isNaN(parsedStart.getTime())) {
        return res.status(400).json({ error: 'Invalid startDate — use YYYY-MM-DD format' });
      }
      where.date = { ...where.date, gte: parsedStart };
    }

    if (endDate) {
      const parsedEnd = new Date(endDate);
      if (isNaN(parsedEnd.getTime())) {
        return res.status(400).json({ error: 'Invalid endDate — use YYYY-MM-DD format' });
      }
      where.date = { ...where.date, lte: parsedEnd };
    }

    if (category) {
      where.category = category;
    }

    if (item) {
      where.item_name = { contains: item, mode: 'insensitive' };
    }

    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);

    if (isNaN(pageNum) || pageNum < 1) {
      return res.status(400).json({ error: 'page must be a positive number' });
    }
    if (isNaN(limitNum) || limitNum < 1 || limitNum > 200) {
      return res.status(400).json({ error: 'limit must be between 1 and 200' });
    }

    const grouped = await prisma.sale.groupBy({
      by: ['item_name', 'date', 'category'],
      where,
      _sum: {
        items_sold: true,
        totalSales: true,
      },
      _avg: {
        net_price: true,
      },
      orderBy: [{ date: 'desc' }, { item_name: 'asc' }],
    });

    const totalRows = grouped.length;
    const startIndex = (pageNum - 1) * limitNum;
    const paginated = grouped.slice(startIndex, startIndex + limitNum);

    const formatted = paginated.map((row) => ({
      item_name: row.item_name,
      category: row.category,
      month: row.date.toISOString().split('T')[0],
      net_price: row._avg.net_price,
      items_sold: row._sum.items_sold,
      totalSales: row._sum.totalSales,
    }));

    res.json({
      page: pageNum,
      limit: limitNum,
      totalRows,
      totalPages: Math.ceil(totalRows / limitNum),
      sales: formatted,
    });
  } catch (error) {
    console.error('Get sales table error:', error);
    res.status(500).json({ error: 'Failed to fetch sales table' });
  }
};


export const getCategories = async (req, res) => {
  try {
    const categories = await prisma.sale.findMany({
      distinct: ['category'],
      select: { category: true },
      orderBy: { category: 'asc' },
    });

    res.json({ categories: categories.map((c) => c.category) });
  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
};