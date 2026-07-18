import { useCallback, useEffect, useRef, useState } from 'react';
import { BarChart3, Calendar, ClipboardList, Download, Package, RefreshCcw, Upload } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';

import api from '../api/axios';
import Table from '../components/Table';
import Dropdown from '../components/Dropdown';

const pageSizeOptions = [
  { label: '25 per page', value: 25 },
  { label: '50 per page', value: 50 },
  { label: '100 per page', value: 100 },
  { label: '200 per page', value: 200 },
];

const formatMonth = (value) =>
  new Intl.DateTimeFormat('en', { year: 'numeric', month: 'long' }).format(new Date(value));

const formatCurrency = (value) =>
  new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(Number(value) || 0);

const emptyImportSummary = null;

export default function Sales() {
  const navigate = useNavigate();
  const location = useLocation();
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [categoryOptions, setCategoryOptions] = useState([{ label: 'All categories', value: 'all' }]);

  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [category, setCategory] = useState('all');
  const [month, setMonth] = useState('');

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  const [totalPages, setTotalPages] = useState(1);
  const [totalRows, setTotalRows] = useState(0);

  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [importSummary, setImportSummary] = useState(emptyImportSummary);
  const fileInputRef = useRef(null);
  const latestRequestRef = useRef(0);
  const activeCategoryLabel = categoryOptions.find((option) => option.value === category)?.label || category;

  // Pull the actual categories that exist in the database, once on mount —
  // so this list always reflects real data instead of a hardcoded guess
  useEffect(() => {
    const loadCategories = async () => {
      try {
        const response = await api.get('/sales/categories');
        const options = [
          { label: 'All categories', value: 'all' },
          ...(response.data.categories || []).map((c) => ({ label: c, value: c })),
        ];
        setCategoryOptions(options);
      } catch {
        // Non-fatal — filter just won't have category options if this fails,
        // search/date filtering still works fine on its own
      }
    };

    loadCategories();
  }, []);

  // Debounce the search input before it becomes the actual query param —
  // otherwise every keystroke would fire a new request to the backend
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearchTerm(searchInput.trim());
      setPage(1);
    }, 400);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    setPage(1);
  }, [category, month, limit]);

  const loadSales = useCallback(async () => {
    const requestId = ++latestRequestRef.current;
    setLoading(true);
    setError('');

    try {
      const params = { page, limit };

      if (searchTerm) params.item = searchTerm;
      if (category !== 'all') params.category = category;
      if (month) params.month = month;

      const response = await api.get('/sales/table', { params });

      if (requestId !== latestRequestRef.current) return;

      setSales(response.data.sales || []);
      setTotalPages(response.data.totalPages || 1);
      setTotalRows(response.data.totalRows || 0);
    } catch (err) {
      if (requestId !== latestRequestRef.current) return;

      setError(err.response?.data?.error || 'Unable to load sales data right now.');
      setSales([]);
    } finally {
      if (requestId !== latestRequestRef.current) return;

      setLoading(false);
    }
  }, [page, limit, searchTerm, category, month]);

  useEffect(() => {
    loadSales();
  }, [loadSales]);

  useEffect(() => {
    if (!success) return undefined;
    const timer = window.setTimeout(() => setSuccess(''), 3000);
    return () => window.clearTimeout(timer);
  }, [success]);

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelected = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setImporting(true);
    setError('');
    setSuccess('');
    setImportSummary(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await api.post('/sales/import', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      setImportSummary(response.data);
      setSuccess(`Imported ${response.data.inserted} of ${response.data.totalRows} rows.`);
      setPage(1);
      await loadSales();

      // A new import might introduce a category that wasn't there before
      try {
        const catResponse = await api.get('/sales/categories');
        const options = [
          { label: 'All categories', value: 'all' },
          ...(catResponse.data.categories || []).map((c) => ({ label: c, value: c })),
        ];
        setCategoryOptions(options);
      } catch {
        // non-fatal, existing category list just won't update
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Import failed.');
    } finally {
      setImporting(false);
      event.target.value = '';
    }
  };

  const handleExport = async (format) => {
    setExporting(true);
    setError('');

    try {
      const params = { format };
      if (category !== 'all') params.category = category;
      if (month) params.month = month;

      const response = await api.get('/sales/export', {
        params,
        responseType: 'blob',
      });

      const blob = new Blob([response.data]);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `sales_export.${format}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.response?.data?.error || 'Export failed.');
    } finally {
      setExporting(false);
    }
  };

  const columns = [
    {
      key: 'item_name',
      header: 'Item',
      render: (row) => <span className="font-medium text-emerald-950">{row.item_name}</span>,
    },
    {
      key: 'category',
      header: 'Category',
      render: (row) => (
        <span className="inline-flex rounded-full bg-lime-100 px-3 py-1 text-xs font-medium text-lime-900">
          {row.category}
        </span>
      ),
    },
    {
      key: 'month',
      header: 'Month',
      render: (row) => formatMonth(row.month),
    },
    {
      key: 'net_price',
      header: 'Net Price',
      align: 'right',
      render: (row) => formatCurrency(row.net_price),
    },
    {
      key: 'items_sold',
      header: 'Items Sold',
      align: 'right',
      render: (row) => row.items_sold,
    },
    {
      key: 'totalSales',
      header: 'Total Sales',
      align: 'right',
      render: (row) => <span className="font-medium text-emerald-950">{formatCurrency(row.totalSales)}</span>,
    },
  ];

  return (
    <section className="grid gap-6">
      <div className="overflow-hidden rounded-[1.5rem] border border-emerald-900/10 bg-[#fbfaf7] shadow-sm shadow-emerald-950/5">
        <div className="flex items-start gap-4 border-b border-emerald-900/10 px-6 py-5">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-blue-200/70 bg-blue-50 text-blue-600">
            <Package className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-3xl font-semibold tracking-tight text-emerald-950">Sales Management</h2>
            <p className="mt-1 text-sm text-emerald-900/65">Manage sales records and generate analytics reports.</p>
          </div>
        </div>

        <div className="flex items-center gap-2 px-5 pt-3">
          <button
            type="button"
            onClick={() => navigate('/sales')}
            className={`inline-flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium transition ${
              location.pathname === '/sales'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-emerald-900/70 hover:text-emerald-950'
            }`}
          >
            <ClipboardList className="h-4 w-4" />
            Sales Records
          </button>

          <button
            type="button"
            onClick={() => navigate('/reports')}
            className={`inline-flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium transition ${
              location.pathname === '/reports'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-emerald-900/70 hover:text-emerald-950'
            }`}
          >
            <BarChart3 className="h-4 w-4" />
            Reports
          </button>
        </div>
      </div>

      <div className="rounded-[1.5rem] border border-emerald-900/10 bg-[#fbfaf7] p-6 sm:p-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-lime-700/70">Sales</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-emerald-950 sm:text-4xl">
              Sales records
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              className="hidden"
              onChange={handleFileSelected}
            />
            <button
              type="button"
              onClick={handleImportClick}
              disabled={importing}
              className="inline-flex items-center gap-2 rounded-2xl border border-emerald-900/10 bg-white px-4 py-3 text-sm font-medium text-emerald-900/80 shadow-sm shadow-emerald-950/5 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Upload className="h-4 w-4" />
              {importing ? 'Importing...' : 'Import'}
            </button>

            <button
              type="button"
              onClick={() => handleExport('csv')}
              disabled={exporting}
              className="inline-flex items-center gap-2 rounded-2xl bg-emerald-950 px-4 py-3 text-sm font-medium text-white shadow-sm shadow-emerald-950/10 transition hover:bg-emerald-900 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Download className="h-4 w-4" />
              {exporting ? 'Exporting...' : 'Export CSV'}
            </button>
          </div>
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          <article className="rounded-2xl border border-emerald-900/10 bg-white p-4">
            <p className="text-xs uppercase tracking-[0.3em] text-lime-700/60">Total records</p>
            <p className="mt-3 text-2xl font-semibold text-emerald-950">{totalRows}</p>
          </article>

          <article className="rounded-2xl border border-emerald-900/10 bg-white p-4">
            <p className="text-xs uppercase tracking-[0.3em] text-lime-700/60">Months covered</p>
            <p className="mt-3 text-2xl font-semibold text-emerald-950">
              {!month
                ? 'All time'
                : formatMonth(`${month}-01`)}
            </p>
          </article>

          <article className="rounded-2xl border border-emerald-900/10 bg-white p-4">
            <p className="text-xs uppercase tracking-[0.3em] text-lime-700/60">Active category</p>
            <p className="mt-3 text-2xl font-semibold text-emerald-950">{activeCategoryLabel}</p>
          </article>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </div>
      )}

      {success && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {success}
        </div>
      )}

      {importSummary && importSummary.failed > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {importSummary.failed} row(s) failed validation and were skipped. First few reasons:
          <ul className="mt-2 list-disc pl-5">
            {importSummary.failedRows.slice(0, 5).map((f) => (
              <li key={f.row}>
                Row {f.row}: {f.reasons?.join(', ')}
              </li>
            ))}
          </ul>
        </div>
      )}

      <Table
        title="Sales table"
        description="Search by item name, filter by category, or narrow by month."
        searchValue={searchInput}
        onSearchChange={setSearchInput}
        searchPlaceholder="Search item name"
        filterValue={category}
        onFilterChange={setCategory}
        filterOptions={categoryOptions}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 rounded-2xl border border-emerald-900/10 bg-white px-3 py-3 text-sm text-emerald-950 shadow-sm shadow-emerald-950/5">
              <Calendar className="h-4 w-4 shrink-0 text-emerald-900/45" />
              <input
                type="month"
                value={month}
                onChange={(e) => {
                  setMonth(e.target.value);
                  setPage(1);
                }}
                className="bg-transparent text-sm text-emerald-950 outline-none"
              />
            </label>

            {month && (
              <button
                type="button"
                onClick={() => {
                  setMonth('');
                }}
                title="Clear month filter"
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-900/10 bg-white text-emerald-900/60 transition hover:bg-emerald-50 hover:text-emerald-950"
              >
                <RefreshCcw className="h-4 w-4" />
              </button>
            )}
          </div>
        }
        columns={columns}
        data={sales}
        loading={loading}
        emptyState="No sales records match the current search or filter."
        maxHeight="28rem"
      />

      <div className="flex items-center justify-between rounded-[1.5rem] border border-emerald-900/10 bg-[#fbfaf7] px-6 py-4">
        <div className="flex items-center gap-4">
          <p className="text-sm text-emerald-900/60">
            Showing page {page} of {totalPages} ({totalRows} total rows)
          </p>

          <Dropdown value={limit} onChange={setLimit} options={pageSizeOptions} className="w-40" />
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="rounded-xl border border-emerald-900/10 bg-white px-4 py-2 text-sm font-medium text-emerald-900/70 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Previous
          </button>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="rounded-xl border border-emerald-900/10 bg-white px-4 py-2 text-sm font-medium text-emerald-900/70 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </div>
    </section>
  );
}