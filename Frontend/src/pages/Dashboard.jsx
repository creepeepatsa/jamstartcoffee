import { ArrowRight, BarChart3, Coffee, Sparkles } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const stats = [
  { label: 'Orders today', value: '128', detail: '+12% from yesterday' },
  { label: 'Bean stock', value: '78%', detail: 'Ready for the morning rush' },
  { label: 'Forecast accuracy', value: '94%', detail: 'Last 7 days average' },
];

export default function Dashboard() {
  const { user } = useAuth();
  const name = user?.first_name || 'there';

  return (
    <section className="grid gap-6">
      <div className="rounded-[1.5rem] border border-emerald-900/10 bg-[#fbfaf7] p-6 sm:p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-lime-700/70">Dashboard</p>
            <h1 className="mt-3 max-w-xl text-3xl font-semibold tracking-tight text-emerald-950 sm:text-4xl">
              Welcome back, {name}.
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-emerald-900/65 sm:text-base">
              A cleaner workspace for your cafe operations, kept calm and easy to scan.
            </p>
          </div>
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-lime-700/10 bg-lime-100 text-lime-900">
            <Sparkles className="h-5 w-5" />
          </div>
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          {stats.map((stat) => (
            <article key={stat.label} className="rounded-2xl border border-emerald-900/10 bg-white p-4">
              <p className="text-xs uppercase tracking-[0.3em] text-lime-700/60">{stat.label}</p>
              <p className="mt-3 text-2xl font-semibold text-emerald-950">{stat.value}</p>
              <p className="mt-2 text-sm text-emerald-900/58">{stat.detail}</p>
            </article>
          ))}
        </div>
      </div>

      <div className="rounded-[1.5rem] border border-emerald-900/10 bg-white p-6 sm:p-8">
        
      </div>
    </section>
  );
}