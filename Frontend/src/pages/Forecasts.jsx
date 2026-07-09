import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Bar,
  BarChart,
} from 'recharts';
import { CalendarDays, ChartColumn, CircleDollarSign, Sparkles, TrendingUp } from 'lucide-react';

const salesTrend = [
  { week: 'W1', actual: 124, forecast: 132 },
  { week: 'W2', actual: 138, forecast: 144 },
  { week: 'W3', actual: 151, forecast: 158 },
  { week: 'W4', actual: 146, forecast: 162 },
  { week: 'W5', actual: 159, forecast: 171 },
  { week: 'W6', actual: 164, forecast: 178 },
];

const categoryForecast = [
  { name: 'Espresso', forecast: 420 },
  { name: 'Latte', forecast: 590 },
  { name: 'Cappuccino', forecast: 315 },
  { name: 'Pastries', forecast: 260 },
  { name: 'Cold Brew', forecast: 340 },
];

const forecastStats = [
  { label: 'Projected orders', value: '1,530', detail: 'Next 7 days' },
  { label: 'Projected revenue', value: '₱84,500', detail: 'Estimated total sales' },
  { label: 'Top category', value: 'Latte', detail: 'Highest forecast demand' },
];

const riskNotes = [
  'Monday and Tuesday remain the slowest days.',
  'Friday and Saturday peak between 8 AM and 11 AM.',
  'Pastry demand rises when rain is expected.',
  'Cold drinks hold steady during the afternoon rush.',
];

export default function Forecasts() {
  return (
    <section className="grid gap-6">
      <div className="rounded-[1.5rem] border border-emerald-900/10 bg-[#fbfaf7] p-6 sm:p-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-2xl">
            <p className="text-xs uppercase tracking-[0.35em] text-lime-700/70">Forecasts</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-emerald-950 sm:text-4xl">
              Forecasting sample data
            </h1>
            <p className="mt-3 text-sm leading-6 text-emerald-900/65 sm:text-base">
              This page uses fixed example numbers and charts so you can see how a forecasting screen may
              look before any backend or live prediction logic is connected.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:w-[24rem] lg:grid-cols-1">
            <div className="rounded-2xl border border-emerald-900/10 bg-white p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-lime-100 text-lime-900">
                  <Sparkles className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-lime-700/60">Confidence level</p>
                  <p className="mt-1 text-lg font-semibold text-emerald-950">92%</p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-emerald-900/10 bg-white p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-900">
                  <TrendingUp className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-lime-700/60">Expected growth</p>
                  <p className="mt-1 text-lg font-semibold text-emerald-950">+14% vs. last period</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.35fr_0.95fr]">
        <div className="grid gap-6">
          <div className="rounded-[1.5rem] border border-emerald-900/10 bg-white p-6 sm:p-8">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-900">
                <ChartColumn className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-lime-700/60">Sales trend</p>
                <h2 className="mt-1 text-2xl font-semibold tracking-tight text-emerald-950">
                  Weekly actual vs. forecast
                </h2>
              </div>
            </div>

            <div className="mt-6 h-80 rounded-3xl border border-emerald-900/10 bg-[#fbfaf7] p-3 sm:p-4">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={salesTrend} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#d6e2db" />
                  <XAxis dataKey="week" tickLine={false} axisLine={false} />
                  <YAxis tickLine={false} axisLine={false} />
                  <Tooltip
                    contentStyle={{
                      borderRadius: '16px',
                      border: '1px solid #d6e2db',
                      background: '#fff',
                    }}
                  />
                  <Line type="monotone" dataKey="actual" stroke="#14532d" strokeWidth={3} dot={{ r: 4 }} />
                  <Line
                    type="monotone"
                    dataKey="forecast"
                    stroke="#84cc16"
                    strokeWidth={3}
                    strokeDasharray="6 6"
                    dot={{ r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rounded-[1.5rem] border border-emerald-900/10 bg-white p-6 sm:p-8">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-lime-100 text-lime-900">
                <CircleDollarSign className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-lime-700/60">Category forecast</p>
                <h2 className="mt-1 text-2xl font-semibold tracking-tight text-emerald-950">
                  Expected demand by item
                </h2>
              </div>
            </div>

            <div className="mt-6 h-80 rounded-3xl border border-emerald-900/10 bg-[#fbfaf7] p-3 sm:p-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={categoryForecast} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#d6e2db" vertical={false} />
                  <XAxis dataKey="name" tickLine={false} axisLine={false} />
                  <YAxis tickLine={false} axisLine={false} />
                  <Tooltip
                    contentStyle={{
                      borderRadius: '16px',
                      border: '1px solid #d6e2db',
                      background: '#fff',
                    }}
                  />
                  <Bar dataKey="forecast" fill="#14532d" radius={[10, 10, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <div className="grid gap-6">
          <div className="rounded-[1.5rem] border border-emerald-900/10 bg-white p-6 sm:p-8">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white text-emerald-900 ring-1 ring-emerald-900/10">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-lime-700/60">Forecast summary</p>
                <h2 className="mt-1 text-2xl font-semibold tracking-tight text-emerald-950">
                  Static example numbers
                </h2>
              </div>
            </div>

            <div className="mt-6 grid gap-4">
              {forecastStats.map((stat) => (
                <article key={stat.label} className="rounded-2xl border border-emerald-900/10 bg-[#fbfaf7] p-4">
                  <p className="text-xs uppercase tracking-[0.28em] text-lime-700/55">{stat.label}</p>
                  <p className="mt-2 text-2xl font-semibold text-emerald-950">{stat.value}</p>
                  <p className="mt-1 text-sm text-emerald-900/65">{stat.detail}</p>
                </article>
              ))}
            </div>
          </div>

          <div className="rounded-[1.5rem] border border-emerald-900/10 bg-[#0f2f24] p-6 text-white sm:p-8">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/10 text-white">
                <CalendarDays className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-white/55">Example notes</p>
                <h2 className="mt-1 text-2xl font-semibold tracking-tight">What this chart says</h2>
              </div>
            </div>

            <ul className="mt-5 space-y-3 text-sm leading-6 text-white/80">
              {riskNotes.map((item) => (
                <li key={item} className="flex items-start gap-3">
                  <span className="mt-2 h-2 w-2 rounded-full bg-lime-300" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>

            <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-sm uppercase tracking-[0.28em] text-white/55">Forecast period</p>
              <p className="mt-2 text-xl font-semibold text-white">July 1 to July 31, 2026</p>
              <p className="mt-2 text-sm text-white/70">
                This is sample data only, meant to demonstrate a clean forecast layout.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}