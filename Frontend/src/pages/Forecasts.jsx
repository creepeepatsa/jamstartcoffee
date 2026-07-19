import { useEffect, useMemo, useState } from 'react';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Bar,
  BarChart,
} from 'recharts';
import {
  AlertCircle,
  CalendarRange,
  ChartColumn,
  Loader2,
  RefreshCw,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const MONTH_OPTIONS = [3, 6, 12];

const peso = (n) =>
  `₱${Number(n ?? 0).toLocaleString('en-PH', { maximumFractionDigits: 0 })}`;

async function fetchJSON(url) {
  const res = await fetch(url);
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data;
}

export default function Forecasts() {
  const [monthsAhead, setMonthsAhead] = useState(3);
  const [category, setCategory] = useState('');

  const [revenue, setRevenue] = useState(null);
  const [revenueLoading, setRevenueLoading] = useState(true);
  const [revenueError, setRevenueError] = useState(null);

  const [byCategory, setByCategory] = useState(null);
  const [categoryLoading, setCategoryLoading] = useState(true);
  const [categoryError, setCategoryError] = useState(null);

  const loadRevenue = async () => {
    setRevenueLoading(true);
    setRevenueError(null);
    try {
      const params = new URLSearchParams({ monthsAhead });
      if (category) params.set('category', category);
      const data = await fetchJSON(`${API_BASE}/analytics/forecast?${params}`);
      setRevenue(data);
    } catch (err) {
      setRevenue(null);
      setRevenueError(err.message);
    } finally {
      setRevenueLoading(false);
    }
  };

  const loadCategories = async () => {
    setCategoryLoading(true);
    setCategoryError(null);
    try {
      const params = new URLSearchParams({ monthsAhead });
      const data = await fetchJSON(`${API_BASE}/analytics/forecast-by-category?${params}`);
      setByCategory(data);
    } catch (err) {
      setByCategory(null);
      setCategoryError(err.message);
    } finally {
      setCategoryLoading(false);
    }
  };

  useEffect(() => {
    loadRevenue();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthsAhead, category]);

  useEffect(() => {
    loadCategories();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthsAhead]);

  const categoryOptions = useMemo(
    () => byCategory?.categories?.map((c) => c.category) ?? [],
    [byCategory]
  );

  // Merge history + forecast into one timeline, bridging the last actual
  // point into the first forecast point so the line reads as continuous.
  const revenueChartData = useMemo(() => {
    if (!revenue) return [];
    const history = (revenue.history ?? []).map((h) => ({
      month: h.month,
      actualRevenue: h.actualRevenue,
      predictedRevenue: null,
      range: null,
    }));
    if (history.length) {
      history[history.length - 1].predictedRevenue = history[history.length - 1].actualRevenue;
    }
    const forecast = (revenue.forecast ?? []).map((f) => ({
      month: f.month,
      actualRevenue: null,
      predictedRevenue: f.predictedRevenue,
      range: [f.lowerBound, f.upperBound],
    }));
    return [...history, ...forecast];
  }, [revenue]);

  const projectedTotal = useMemo(
    () => (revenue?.forecast ?? []).reduce((sum, f) => sum + (f.predictedRevenue ?? 0), 0),
    [revenue]
  );

  const lastActual = revenue?.history?.at(-1)?.actualRevenue ?? null;
  const firstForecast = revenue?.forecast?.[0]?.predictedRevenue ?? null;
  const trendPct =
    lastActual && firstForecast != null && lastActual > 0
      ? ((firstForecast - lastActual) / lastActual) * 100
      : null;

  // Rank categories by total projected units across the selected window.
  const categoryRanking = useMemo(() => {
    if (!byCategory?.categories) return [];
    return byCategory.categories
      .map((c) => ({
        category: c.category,
        method: c.method,
        note: c.note,
        totalUnits: (c.forecast ?? []).reduce((s, f) => s + (f.predictedUnits ?? 0), 0),
        forecast: c.forecast ?? [],
      }))
      .sort((a, b) => b.totalUnits - a.totalUnits);
  }, [byCategory]);

  return (
    <section className="grid gap-6">
      {/* Header + controls */}
      <div className="rounded-[1.5rem] border border-emerald-900/10 bg-[#fbfaf7] p-6 sm:p-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-2xl">
            <p className="text-xs uppercase tracking-[0.35em] text-lime-700/70">Forecasts</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-emerald-950 sm:text-4xl">
              Sales forecast
            </h1>
            <p className="mt-3 text-sm leading-6 text-emerald-900/65 sm:text-base">
              Prophet-driven projections generated from your actual sales history. Low-volume
              categories fall back to a trailing average when there isn't enough history to model.
            </p>
          </div>

          <div className="flex flex-col gap-3 lg:w-[22rem]">
            <div className="flex items-center gap-2 rounded-2xl border border-emerald-900/10 bg-white p-1.5">
              {MONTH_OPTIONS.map((m) => (
                <button
                  key={m}
                  onClick={() => setMonthsAhead(m)}
                  className={`flex-1 rounded-xl px-3 py-2 text-sm font-medium transition ${
                    monthsAhead === m
                      ? 'bg-emerald-950 text-white'
                      : 'text-emerald-900/60 hover:bg-emerald-50'
                  }`}
                >
                  {m}mo
                </button>
              ))}
            </div>

            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="rounded-2xl border border-emerald-900/10 bg-white px-4 py-2.5 text-sm text-emerald-950 outline-none focus:ring-2 focus:ring-emerald-900/20"
            >
              <option value="">All categories</option>
              {categoryOptions.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.35fr_0.95fr]">
        {/* Revenue forecast chart */}
        <div className="rounded-[1.5rem] border border-emerald-900/10 bg-white p-6 sm:p-8">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-900">
                <ChartColumn className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-lime-700/60">Revenue</p>
                <h2 className="mt-1 text-2xl font-semibold tracking-tight text-emerald-950">
                  Actual vs. projected
                </h2>
              </div>
            </div>
            <button
              onClick={loadRevenue}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-emerald-900/10 text-emerald-900/60 hover:bg-emerald-50"
              title="Refresh"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-6 h-80 rounded-3xl border border-emerald-900/10 bg-[#fbfaf7] p-3 sm:p-4">
            {revenueLoading ? (
              <div className="flex h-full items-center justify-center gap-2 text-emerald-900/50">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading forecast…
              </div>
            ) : revenueError ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-emerald-900/60">
                <AlertCircle className="h-5 w-5" />
                <p className="max-w-xs text-sm">{revenueError}</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={revenueChartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#d6e2db" />
                  <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={12} />
                  <YAxis tickLine={false} axisLine={false} fontSize={12} tickFormatter={peso} width={70} />
                  <Tooltip
                    formatter={(value, name) =>
                      name === 'Confidence range' ? null : [peso(value), name]
                    }
                    contentStyle={{ borderRadius: '16px', border: '1px solid #d6e2db', background: '#fff' }}
                  />
                  <Area
                    dataKey="range"
                    stroke="none"
                    fill="#84cc16"
                    fillOpacity={0.15}
                    name="Confidence range"
                  />
                  <Line
                    type="monotone"
                    dataKey="actualRevenue"
                    name="Actual"
                    stroke="#14532d"
                    strokeWidth={3}
                    dot={{ r: 3 }}
                    connectNulls={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="predictedRevenue"
                    name="Forecast"
                    stroke="#84cc16"
                    strokeWidth={3}
                    strokeDasharray="6 6"
                    dot={{ r: 3 }}
                    connectNulls
                  />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Summary + category ranking */}
        <div className="grid gap-6">
          <div className="rounded-[1.5rem] border border-emerald-900/10 bg-white p-6 sm:p-8">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white text-emerald-900 ring-1 ring-emerald-900/10">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-lime-700/60">Summary</p>
                <h2 className="mt-1 text-2xl font-semibold tracking-tight text-emerald-950">
                  Next {monthsAhead} months
                </h2>
              </div>
            </div>

            <div className="mt-6 grid gap-4">
              <article className="rounded-2xl border border-emerald-900/10 bg-[#fbfaf7] p-4">
                <p className="text-xs uppercase tracking-[0.28em] text-lime-700/55">Projected revenue</p>
                <p className="mt-2 text-2xl font-semibold text-emerald-950">
                  {revenueLoading ? '—' : peso(projectedTotal)}
                </p>
                <p className="mt-1 text-sm text-emerald-900/65">
                  Sum of monthly predictions, {category || 'all categories'}
                </p>
              </article>

              <article className="rounded-2xl border border-emerald-900/10 bg-[#fbfaf7] p-4">
                <p className="text-xs uppercase tracking-[0.28em] text-lime-700/55">Near-term direction</p>
                <div className="mt-2 flex items-center gap-2">
                  {trendPct == null ? (
                    <p className="text-2xl font-semibold text-emerald-950">—</p>
                  ) : (
                    <>
                      {trendPct >= 0 ? (
                        <TrendingUp className="h-5 w-5 text-emerald-700" />
                      ) : (
                        <TrendingDown className="h-5 w-5 text-amber-700" />
                      )}
                      <p className="text-2xl font-semibold text-emerald-950">
                        {trendPct >= 0 ? '+' : ''}
                        {trendPct.toFixed(1)}%
                      </p>
                    </>
                  )}
                </div>
                <p className="mt-1 text-sm text-emerald-900/65">Next month vs. last recorded month</p>
              </article>
            </div>
          </div>

          <div className="rounded-[1.5rem] border border-emerald-900/10 bg-[#0f2f24] p-6 text-white sm:p-8">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/10 text-white">
                <CalendarRange className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-white/55">Top categories</p>
                <h2 className="mt-1 text-2xl font-semibold tracking-tight">Projected units</h2>
              </div>
            </div>

            <div className="mt-5 h-52">
              {categoryLoading ? (
                <div className="flex h-full items-center justify-center gap-2 text-white/50">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                </div>
              ) : categoryError ? (
                <div className="flex h-full items-center justify-center text-center text-sm text-white/60">
                  {categoryError}
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={categoryRanking} layout="vertical" margin={{ top: 0, right: 20, left: 0, bottom: 0 }}>
                    <XAxis type="number" hide />
                    <YAxis
                      type="category"
                      dataKey="category"
                      width={90}
                      tickLine={false}
                      axisLine={false}
                      fontSize={12}
                      stroke="#ffffffaa"
                    />
                    <Tooltip
                      formatter={(v) => [`${v} units`, 'Projected']}
                      contentStyle={{ borderRadius: '16px', border: 'none' }}
                    />
                    <Bar dataKey="totalUnits" fill="#84cc16" radius={[0, 10, 10, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Detailed per-category table */}
      <div className="rounded-[1.5rem] border border-emerald-900/10 bg-white p-6 sm:p-8">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-lime-100 text-lime-900">
            <ChartColumn className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-lime-700/60">Breakdown</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-emerald-950">
              Units by category, month by month
            </h2>
          </div>
        </div>

        <div className="mt-6 overflow-x-auto">
          {categoryLoading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-emerald-900/50">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : categoryError ? (
            <div className="flex items-center justify-center gap-2 py-10 text-emerald-900/60">
              <AlertCircle className="h-4 w-4" /> {categoryError}
            </div>
          ) : (
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-emerald-900/10 text-left text-xs uppercase tracking-[0.2em] text-lime-700/60">
                  <th className="py-3 pr-4">Category</th>
                  {categoryRanking[0]?.forecast.map((f) => (
                    <th key={f.month} className="py-3 pr-4 text-right">
                      {f.month}
                    </th>
                  ))}
                  <th className="py-3 pl-4 text-right">Method</th>
                </tr>
              </thead>
              <tbody>
                {categoryRanking.map((c) => (
                  <tr key={c.category} className="border-b border-emerald-900/5">
                    <td className="py-3 pr-4 font-medium text-emerald-950">{c.category}</td>
                    {c.forecast.map((f) => (
                      <td key={f.month} className="py-3 pr-4 text-right text-emerald-900/80">
                        {f.predictedUnits}
                      </td>
                    ))}
                    <td className="py-3 pl-4 text-right">
                      <span
                        title={c.note || undefined}
                        className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                          c.method === 'prophet'
                            ? 'bg-emerald-50 text-emerald-800'
                            : 'bg-amber-50 text-amber-800'
                        }`}
                      >
                        {c.method === 'prophet' ? 'Modeled' : 'Trailing avg'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </section>
  );
}