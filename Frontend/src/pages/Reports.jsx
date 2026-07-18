import { useEffect, useState } from 'react';
import { BarChart3, Calendar, ClipboardList, Download, FileText, Package } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import api from '../api/axios';

const reportTypes = [
  {
    key: 'sales_report',
    name: 'Sales Report',
    description: 'High-level summary of revenue, units sold, and transactions for a selected period.',
    usefulFor: 'Owner weekly and monthly check-ins',
  },
  {
    key: 'mom_report',
    name: 'MoM Report',
    description: 'Month-over-month totals and trend direction over time.',
    usefulFor: 'Tracking short-term growth or decline',
  },
  {
    key: 'yoy_report',
    name: 'YoY Report',
    description: 'Year-over-year totals comparing the same period across years.',
    usefulFor: 'Spotting seasonal patterns and long-term growth',
  },
  {
    key: 'category_performance',
    name: 'Category Performance Report',
    description: 'Revenue and volume by category (e.g., Hot Coffee, Mains, Snacks).',
    usefulFor: 'Menu and category strategy decisions',
  },
  {
    key: 'item_performance',
    name: 'Item Performance Report',
    description: 'Top and low-performing products by revenue and units sold.',
    usefulFor: 'Product line optimization',
  },
];

function monthBounds(monthValue) {
  if (!monthValue) return null;

  const match = /^(\d{4})-(\d{2})$/.exec(monthValue);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);

  const start = new Date(Date.UTC(year, month - 1, 1));
  const nextMonth = new Date(Date.UTC(year, month, 1));
  const end = new Date(nextMonth.getTime() - 1);

  return { start: start.toISOString(), end: end.toISOString() };
}

export default function Reports() {
  const navigate = useNavigate();
  const location = useLocation();
  const [reportType, setReportType] = useState('sales_report');
  const [format, setFormat] = useState('csv');
  const [month, setMonth] = useState('');
  const [category, setCategory] = useState('all');
  const [categories, setCategories] = useState([{ label: 'All categories', value: 'all' }]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const loadCategories = async () => {
      try {
        const response = await api.get('/sales/categories');
        const options = [
          { label: 'All categories', value: 'all' },
          ...(response.data.categories || []).map((c) => ({ label: c, value: c })),
        ];
        setCategories(options);
      } catch {
        // Non-fatal: report generation can still run without category filtering options.
      }
    };

    loadCategories();
  }, []);

  const generateReport = async () => {
    setLoading(true);
    setError('');

    try {
      const params = { format, reportType };
      const bounds = monthBounds(month);

      if (bounds) {
        params.startDate = bounds.start;
        params.endDate = bounds.end;
      }

      if (category !== 'all') {
        params.category = category;
      }

      const response = await api.get('/sales/export', {
        params,
        responseType: 'blob',
      });

      const blob = new Blob([response.data]);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${reportType}_${month || 'all-time'}.${format}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.response?.data?.error || 'Unable to generate report right now.');
    } finally {
      setLoading(false);
    }
  };

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

      <section className="w-full rounded-[1.75rem] border border-emerald-900/10 bg-[#fbfaf7] p-6 shadow-sm shadow-emerald-950/5 sm:p-8">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-950/5">
            <FileText className="h-5 w-5 text-emerald-900" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-emerald-950">Generate a report</h2>
            <p className="text-sm text-emerald-900/55">Pick a type, narrow it down, export.</p>
          </div>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-4">
          <label className="grid gap-2 text-sm font-medium text-emerald-900/75">
            Report type
            <select
              value={reportType}
              onChange={(e) => setReportType(e.target.value)}
              className="rounded-xl border border-emerald-900/10 bg-white px-3 py-2.5 text-sm text-emerald-950 outline-none transition focus:border-emerald-700/40 focus:ring-2 focus:ring-emerald-700/10"
            >
              {reportTypes.map((type) => (
                <option key={type.key} value={type.key}>
                  {type.name}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-2 text-sm font-medium text-emerald-900/75">
            Month
            <div className="flex items-center gap-2 rounded-xl border border-emerald-900/10 bg-white px-3 py-2.5 transition focus-within:border-emerald-700/40 focus-within:ring-2 focus-within:ring-emerald-700/10">
              <Calendar className="h-4 w-4 shrink-0 text-emerald-900/40" />
              <input
                type="month"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                className="w-full bg-transparent text-sm text-emerald-950 outline-none"
              />
            </div>
          </label>

          <label className="grid gap-2 text-sm font-medium text-emerald-900/75">
            Category
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="rounded-xl border border-emerald-900/10 bg-white px-3 py-2.5 text-sm text-emerald-950 outline-none transition focus:border-emerald-700/40 focus:ring-2 focus:ring-emerald-700/10"
            >
              {categories.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-2 text-sm font-medium text-emerald-900/75">
            Export format
            <div className="grid grid-cols-2 gap-2">
              {['csv', 'xlsx'].map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setFormat(opt)}
                  className={`rounded-xl border px-3 py-2.5 text-sm font-medium transition ${
                    format === opt
                      ? 'border-emerald-900/20 bg-emerald-950 text-white'
                      : 'border-emerald-900/10 bg-white text-emerald-900/65 hover:bg-emerald-50'
                  }`}
                >
                  {opt === 'csv' ? 'CSV' : 'XLSX'}
                </button>
              ))}
            </div>
          </label>
        </div>

        {error && (
          <p className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
        )}

        <button
          type="button"
          onClick={generateReport}
          disabled={loading}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-950 px-4 py-3 text-sm font-medium text-white shadow-sm shadow-emerald-950/10 transition hover:bg-emerald-900 disabled:cursor-not-allowed disabled:opacity-60 lg:w-auto lg:px-8"
        >
          <Download className="h-4 w-4" />
          {loading ? 'Generating...' : 'Generate report'}
        </button>
      </section>
    </section>
  );
}