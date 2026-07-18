import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, RefreshCcw, Sparkles, TrendingDown, TrendingUp } from 'lucide-react';
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { useAuth } from '../context/AuthContext';
import { fetchCategoryBreakdown, fetchKpiSummary, fetchSalesTrend, fetchTopItems } from '../api/analytics';

const periodOptions = [
  { label: 'All Time', value: 'all' },
  { label: 'Last Year', value: 'year' },
  { label: 'Last Quarter', value: 'quarter' },
  { label: 'Last Month', value: 'month' },
];

const categoryPalette = ['#14532d', '#166534', '#15803d', '#65a30d', '#84cc16', '#a3e635', '#4d7c0f', '#f59e0b'];
const itemPalette = ['#0f766e', '#0891b2', '#0369a1', '#4338ca', '#7c3aed', '#a21caf', '#be123c', '#c2410c'];

const currencyFormatter = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  maximumFractionDigits: 0,
});

const numberFormatter = new Intl.NumberFormat('en-PH');

const monthFormatter = new Intl.DateTimeFormat('en', {
  month: 'short',
  year: 'numeric',
});

function formatDateInput(date) {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function getPeriodRange(period) {
  const now = new Date();

  if (period === 'all') {
    return { from: '2020-01-01', to: formatDateInput(now) };
  }

  if (period === 'month') {
    return { from: formatDateInput(new Date(now.getFullYear(), now.getMonth() - 1, 1)), to: formatDateInput(now) };
  }

  if (period === 'quarter') {
    return { from: formatDateInput(new Date(now.getFullYear(), now.getMonth() - 3, 1)), to: formatDateInput(now) };
  }

  return { from: formatDateInput(new Date(now.getFullYear() - 1, now.getMonth(), 1)), to: formatDateInput(now) };
}

function formatCurrency(value) {
  return currencyFormatter.format(Number(value) || 0);
}

function formatNumber(value) {
  return numberFormatter.format(Number(value) || 0);
}

function formatMonth(value) {
  return monthFormatter.format(new Date(value));
}

function formatPercent(value) {
  if (value === null || value === undefined) return 'N/A';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}%`;
}

function SectionCard({ title, description, action, children, className = '' }) {
  return (
    <section className={`rounded-[1.5rem] border border-emerald-900/10 bg-[#fbfaf7] p-5 shadow-sm shadow-emerald-950/5 sm:p-6 ${className}`}>
      <div className="flex flex-col gap-4 border-b border-emerald-900/10 pb-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.35em] text-lime-700/70">{title}</p>
          {description && <p className="mt-2 text-sm text-emerald-900/65">{description}</p>}
        </div>
        {action}
      </div>
      <div className="pt-5">{children}</div>
    </section>
  );
}

function EmptyState({ title, description }) {
  return (
    <div className="flex min-h-[18rem] items-center justify-center rounded-[1.25rem] border border-dashed border-emerald-900/10 bg-white px-6 py-10 text-center">
      <div className="max-w-md">
        <p className="text-base font-medium text-emerald-950">{title}</p>
        {description && <p className="mt-2 text-sm leading-6 text-emerald-900/60">{description}</p>}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const name = user?.first_name || user?.name || 'there';

  const defaults = useMemo(() => getPeriodRange('year'), []);
  const [period, setPeriod] = useState('year');
  const [from, setFrom] = useState(defaults.from);
  const [to, setTo] = useState(defaults.to);

  const [trendData, setTrendData] = useState([]);
  const [topItemsData, setTopItemsData] = useState([]);
  const [categoryData, setCategoryData] = useState([]);
  const [kpiData, setKpiData] = useState(null);

  const [trendLoading, setTrendLoading] = useState(true);
  const [topItemsLoading, setTopItemsLoading] = useState(true);
  const [categoryLoading, setCategoryLoading] = useState(true);
  const [kpiLoading, setKpiLoading] = useState(true);

  const [trendError, setTrendError] = useState('');
  const [topItemsError, setTopItemsError] = useState('');
  const [categoryError, setCategoryError] = useState('');
  const [kpiError, setKpiError] = useState('');

  const requestRef = useRef(0);

  const applyPeriod = useCallback((nextPeriod) => {
    const range = getPeriodRange(nextPeriod);
    setPeriod(nextPeriod);
    setFrom(range.from);
    setTo(range.to);
  }, []);

  const loadOverview = useCallback(async () => {
    const requestId = ++requestRef.current;
    setTrendLoading(true);
    setTopItemsLoading(true);
    setCategoryLoading(true);
    setKpiLoading(true);
    setTrendError('');
    setTopItemsError('');
    setCategoryError('');
    setKpiError('');

    const [trendResult, topItemsResult, categoryResult, kpiResult] = await Promise.allSettled([
      fetchSalesTrend(from, to),
      fetchTopItems(from, to, 5),
      fetchCategoryBreakdown(from, to),
      fetchKpiSummary(from, to),
    ]);

    if (requestId !== requestRef.current) return;

    if (trendResult.status === 'fulfilled') {
      setTrendData(trendResult.value?.trend || []);
    } else {
      setTrendData([]);
      setTrendError(trendResult.reason?.response?.data?.error || 'Unable to load sales trend.');
    }

    if (topItemsResult.status === 'fulfilled') {
      setTopItemsData(topItemsResult.value?.topItems || []);
    } else {
      setTopItemsData([]);
      setTopItemsError(topItemsResult.reason?.response?.data?.error || 'Unable to load top products.');
    }

    if (categoryResult.status === 'fulfilled') {
      setCategoryData(categoryResult.value?.categories || []);
    } else {
      setCategoryData([]);
      setCategoryError(categoryResult.reason?.response?.data?.error || 'Unable to load category breakdown.');
    }

    if (kpiResult.status === 'fulfilled') {
      setKpiData(kpiResult.value || null);
    } else {
      setKpiData(null);
      setKpiError(kpiResult.reason?.response?.data?.error || 'Unable to load month over month growth.');
    }

    setTrendLoading(false);
    setTopItemsLoading(false);
    setCategoryLoading(false);
    setKpiLoading(false);
  }, [from, to]);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  const trendChartData = useMemo(
    () =>
      trendData.map((entry) => ({
        month: formatMonth(entry.month),
        revenue: Number(entry.totalRevenue) || 0,
        units: Number(entry.totalUnits) || 0,
      })),
    [trendData]
  );

  const topItemsChartData = useMemo(
    () =>
      [...topItemsData]
        .sort((a, b) => Number(b.revenue) - Number(a.revenue))
        .map((entry) => ({
          itemName: entry.itemName,
          revenue: Number(entry.revenue) || 0,
        })),
    [topItemsData]
  );

  const itemShareChartData = useMemo(
    () =>
      topItemsData.map((entry) => ({
        name: entry.itemName,
        value: Number(entry.revenue) || 0,
      })),
    [topItemsData]
  );

  const categoryChartData = useMemo(
    () =>
      categoryData.map((entry) => ({
        name: entry.category,
        value: Number(entry.revenue) || 0,
      })),
    [categoryData]
  );

  const handleRefresh = () => {
    void loadOverview();
  };

  const isCurrentPeriod = (value) => period === value;

  const momChangePct = kpiData?.monthOverMonth?.changePct ?? null;
  const isGrowthPositive = momChangePct !== null && momChangePct >= 0;
  const currentMonthRevenue = kpiData?.monthOverMonth?.currentMonthRevenue ?? 0;
  const previousMonthRevenue = kpiData?.monthOverMonth?.previousMonthRevenue ?? 0;

  return (
    <section className="grid gap-6">
      <div className="relative overflow-hidden rounded-[2rem] border border-emerald-900/10 bg-[linear-gradient(135deg,#fbfaf7_0%,#eef8ea_100%)] p-6 shadow-sm shadow-emerald-950/5 sm:p-8">
        <div className="absolute -right-16 -top-16 h-44 w-44 rounded-full bg-lime-300/20 blur-3xl" />
        <div className="absolute bottom-0 right-10 h-32 w-32 rounded-full bg-emerald-200/30 blur-3xl" />

        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-lime-700/70">Analytics dashboard</p>
            <h1 className="mt-3 max-w-3xl text-3xl font-semibold tracking-tight text-emerald-950 sm:text-4xl">
              Welcome back, {name}. Your cafe performance is easy to scan.
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-emerald-900/65 sm:text-base">
              Focus on the sales trend, category mix, and top products without the table clutter.
            </p>
          </div>

          <button
            type="button"
            onClick={handleRefresh}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-950 px-4 py-3 text-sm font-medium text-white shadow-sm shadow-emerald-950/10 transition hover:bg-emerald-900"
          >
            <RefreshCcw className="h-4 w-4" />
            Refresh data
          </button>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-5">
        <SectionCard
          title="Revenue trend"
          description="Revenue and units sold over time for the selected period."
          className="xl:col-span-3"
          action={
            <div className="flex flex-wrap items-center gap-2">
              {periodOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => applyPeriod(option.value)}
                  className={`inline-flex items-center gap-1 rounded-full px-4 py-2 text-[0.65rem] font-semibold uppercase tracking-[0.22em] transition ${
                    isCurrentPeriod(option.value)
                      ? 'bg-emerald-950 text-white shadow-sm shadow-emerald-950/10'
                      : 'border border-emerald-900/10 bg-white text-emerald-900/70 hover:bg-emerald-50'
                  }`}
                >
                  {option.value === 'month' && <ChevronLeft className="h-3.5 w-3.5" />}
                  {option.label}
                  {option.value === 'quarter' && <ChevronRight className="h-3.5 w-3.5" />}
                </button>
              ))}
            </div>
          }
        >
          {trendError ? (
            <EmptyState title="Trend chart unavailable" description={trendError} />
          ) : trendLoading ? (
            <div className="flex min-h-[22rem] items-center justify-center rounded-[1.25rem] border border-dashed border-emerald-900/10 bg-white text-sm text-emerald-900/55">
              Loading trend data...
            </div>
          ) : trendChartData.length === 0 ? (
            <EmptyState title="No trend data in this range" description="Try a wider period preset to show more historical sales activity." />
          ) : (
            <div className="h-[22rem]">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={trendChartData} margin={{ top: 10, right: 12, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="trendRevenue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#14532d" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#14532d" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#d9e7d8" />
                  <XAxis dataKey="month" tickLine={false} axisLine={false} />
                  <YAxis yAxisId="left" tickLine={false} axisLine={false} width={44} />
                  <YAxis yAxisId="right" orientation="right" tickLine={false} axisLine={false} width={44} />
                  <Tooltip
                    formatter={(value, name) => [name === 'revenue' ? formatCurrency(value) : formatNumber(value), name === 'revenue' ? 'Revenue' : 'Units sold']}
                    labelStyle={{ color: '#14532d', fontWeight: 600 }}
                  />
                  <Legend />
                  <Area type="monotone" yAxisId="left" dataKey="revenue" name="Revenue" stroke="#14532d" fill="url(#trendRevenue)" strokeWidth={2} />
                  <Line yAxisId="right" type="monotone" dataKey="units" name="Units sold" stroke="#84cc16" strokeWidth={2.5} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
        </SectionCard>

        <SectionCard title="Category mix" description="Revenue share by category." className="xl:col-span-2">
          {categoryError ? (
            <EmptyState title="Category breakdown unavailable" description={categoryError} />
          ) : categoryLoading ? (
            <div className="flex min-h-[22rem] items-center justify-center rounded-[1.25rem] border border-dashed border-emerald-900/10 bg-white text-sm text-emerald-900/55">
              Loading category data...
            </div>
          ) : categoryChartData.length === 0 ? (
            <EmptyState title="No category data yet" description="This period does not contain enough records to build the chart." />
          ) : (
            <div className="h-[22rem]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Tooltip formatter={(value) => formatCurrency(value)} />
                  <Legend />
                  <Pie data={categoryChartData} dataKey="value" nameKey="name" innerRadius={72} outerRadius={108} paddingAngle={3}>
                    {categoryChartData.map((entry, index) => (
                      <Cell key={entry.name} fill={categoryPalette[index % categoryPalette.length]} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </SectionCard>
      </div>

      <div className="grid gap-6 xl:grid-cols-5">
        <SectionCard title="Item revenue share" description="Revenue share by product for the selected period." className="xl:col-span-3">
          {topItemsError ? (
            <EmptyState title="Item revenue share unavailable" description={topItemsError} />
          ) : topItemsLoading ? (
            <div className="flex min-h-[22rem] items-center justify-center rounded-[1.25rem] border border-dashed border-emerald-900/10 bg-white text-sm text-emerald-900/55">
              Loading item revenue share...
            </div>
          ) : itemShareChartData.length === 0 ? (
            <EmptyState title="No item revenue data yet" description="Try a wider period preset to surface product performance." />
          ) : (
            <div className="h-[22rem]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Tooltip formatter={(value) => formatCurrency(value)} />
                  <Legend />
                  <Pie data={itemShareChartData} dataKey="value" nameKey="name" innerRadius={72} outerRadius={108} paddingAngle={3}>
                    {itemShareChartData.map((entry, index) => (
                      <Cell key={entry.name} fill={itemPalette[index % itemPalette.length]} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </SectionCard>

        <SectionCard title="Month over month growth" description="Current month revenue vs previous month." className="xl:col-span-2">
          {kpiError ? (
            <EmptyState title="Growth data unavailable" description={kpiError} />
          ) : kpiLoading ? (
            <div className="flex min-h-[22rem] items-center justify-center rounded-[1.25rem] border border-dashed border-emerald-900/10 bg-white text-sm text-emerald-900/55">
              Loading growth data...
            </div>
          ) : momChangePct === null ? (
            <EmptyState title="Not enough data" description="Previous month has no recorded sales to compare against." />
          ) : (
            <div className="flex h-[22rem] flex-col justify-center gap-6">
              <div className="flex items-center gap-3">
                <div
                  className={`flex h-14 w-14 items-center justify-center rounded-2xl ${
                    isGrowthPositive ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-600'
                  }`}
                >
                  {isGrowthPositive ? <TrendingUp className="h-7 w-7" /> : <TrendingDown className="h-7 w-7" />}
                </div>
                <div>
                  <p className={`text-3xl font-semibold ${isGrowthPositive ? 'text-emerald-700' : 'text-rose-600'}`}>
                    {formatPercent(momChangePct)}
                  </p>
                  <p className="text-sm text-emerald-900/60">vs. last month</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-2xl border border-emerald-900/10 bg-white p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-emerald-900/50">This month</p>
                  <p className="mt-1 text-lg font-semibold text-emerald-950">{formatCurrency(currentMonthRevenue)}</p>
                </div>
                <div className="rounded-2xl border border-emerald-900/10 bg-white p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-emerald-900/50">Last month</p>
                  <p className="mt-1 text-lg font-semibold text-emerald-950">{formatCurrency(previousMonthRevenue)}</p>
                </div>
              </div>
            </div>
          )}
        </SectionCard>
      </div>

      <SectionCard title="Top products" description="Top 5 products by revenue in the selected period.">
        {topItemsError ? (
          <EmptyState title="Top products unavailable" description={topItemsError} />
        ) : topItemsLoading ? (
          <div className="flex min-h-[18rem] items-center justify-center rounded-[1.25rem] border border-dashed border-emerald-900/10 bg-white text-sm text-emerald-900/55">
            Loading top products...
          </div>
        ) : topItemsChartData.length === 0 ? (
          <EmptyState title="No top products to display" description="Try a wider period preset to surface product performance." />
        ) : (
          <div className="h-[18rem]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topItemsChartData} layout="vertical" margin={{ top: 10, right: 24, bottom: 0, left: 12 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#d9e7d8" />
                <XAxis type="number" tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="itemName" tickLine={false} axisLine={false} width={180} tick={{ fontSize: 12 }} />
                <Tooltip formatter={(value) => formatCurrency(value)} />
                <Bar dataKey="revenue" name="Revenue" fill="#14532d" radius={[0, 10, 10, 0]} barSize={18} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </SectionCard>

      <div className="flex items-center gap-2 text-xs uppercase tracking-[0.35em] text-emerald-900/40">
        <Sparkles className="h-4 w-4" />
        Clean analytics view
      </div>
    </section>
  );
}