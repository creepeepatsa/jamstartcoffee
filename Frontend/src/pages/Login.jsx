import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Coffee, Mail, Lock, Sparkles, ShieldCheck, Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

function Login() {
	// Controlled inputs — each keystroke updates state, state feeds the input's `value`
	const [email, setEmail] = useState('');
	const [password, setPassword] = useState('');

	// UI feedback state
	const [error, setError] = useState('');
	const [submitting, setSubmitting] = useState(false);

	const { login } = useAuth();       // pulls the login() function from AuthContext
	const navigate = useNavigate();    // lets us redirect after a successful login

	const handleSubmit = async (event) => {
		event.preventDefault(); // stop the browser's default full-page-reload form behavior
		setError('');
		setSubmitting(true);

		try {
			await login(email, password); // calls POST /auth/login via AuthContext
			navigate('/dashboard');       // redirect on success
		} catch (err) {
			// err.response.data.error comes from your backend's res.status(401).json({ error: '...' })
			setError(err.response?.data?.error || 'Login failed. Please try again.');
		} finally {
			setSubmitting(false);
		}
	};

	return (
			<main className="min-h-screen bg-[#f6f4ee] text-emerald-950">
			<div className="mx-auto flex min-h-screen max-w-7xl items-center px-4 py-6 sm:px-6 lg:px-8">
				<section className="grid w-full overflow-hidden rounded-[2rem] border border-emerald-900/10 bg-white shadow-sm shadow-emerald-950/5 lg:grid-cols-2">
					<div className="relative order-2 flex items-center justify-center px-6 py-12 sm:px-10 lg:order-1 lg:px-12 lg:py-16">
						<div className="absolute inset-0 bg-[linear-gradient(160deg,rgba(255,255,255,0.8),rgba(255,255,255,0.2))]" />
						<div className="relative w-full max-w-md">
							<div className="mb-8 flex items-center gap-3">
								<div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-lime-700/10 bg-lime-200/40 text-lime-900">
									<Coffee className="h-6 w-6" />
								</div>
								<div>
									<p className="text-xs uppercase tracking-[0.4em] text-lime-700/70">Jamstart Coffee</p>
									<h1 className="mt-1 text-3xl font-semibold tracking-tight text-emerald-950">Welcome back</h1>
								</div>
							</div>

							<div className="rounded-[1.75rem] border border-emerald-900/10 bg-[#fbfaf7] p-6 shadow-sm shadow-emerald-950/5 sm:p-8">
								<div className="mb-8 flex items-center justify-between gap-4">
									<div>
										<p className="text-sm text-emerald-900/60">Sign in to your workspace</p>
										<p className="mt-2 text-2xl font-semibold text-emerald-950">Fresh beans. Faster flow.</p>
									</div>
									<div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-lime-100 text-lime-900">
										<Sparkles className="h-5 w-5" />
									</div>
								</div>

								{/* Error message — only renders when error state is set */}
								{error && (
									<div className="mb-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
										{error}
									</div>
								)}

								<form className="space-y-5" onSubmit={handleSubmit}>
									<label className="block">
										<span className="mb-2 block text-sm font-medium text-emerald-900/80">Email</span>
										<div className="flex items-center gap-3 rounded-2xl border border-emerald-900/10 bg-white px-4 py-3 text-emerald-950 transition focus-within:border-lime-300/60 focus-within:bg-lime-50">
											<Mail className="h-4 w-4 text-lime-700/80" />
											<input
												type="email"
												name="email"
												value={email}
												onChange={(e) => setEmail(e.target.value)}
												placeholder="you@example.com"
												required
												className="w-full bg-transparent text-sm outline-none placeholder:text-emerald-900/35"
											/>
										</div>
									</label>

									<label className="block">
										<span className="mb-2 block text-sm font-medium text-emerald-900/80">Password</span>
										<div className="flex items-center gap-3 rounded-2xl border border-emerald-900/10 bg-white px-4 py-3 text-emerald-950 transition focus-within:border-lime-300/60 focus-within:bg-lime-50">
											<Lock className="h-4 w-4 text-lime-700/80" />
											<input
												type="password"
												name="password"
												value={password}
												onChange={(e) => setPassword(e.target.value)}
												placeholder="Enter your password"
												required
												className="w-full bg-transparent text-sm outline-none placeholder:text-emerald-900/35"
											/>
										</div>
									</label>

									<button
										type="submit"
										disabled={submitting}
										className="group flex w-full items-center justify-center gap-2 rounded-2xl bg-lime-200 px-4 py-3.5 text-sm font-semibold text-emerald-950 transition hover:bg-lime-300 disabled:cursor-not-allowed disabled:opacity-60"
									>
										{submitting ? (
											<>
												<Loader2 className="h-4 w-4 animate-spin" />
												Signing in...
											</>
										) : (
											<>
												Continue to dashboard
												<ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
											</>
										)}
									</button>
								</form>

								<div className="mt-6 flex items-center gap-3 rounded-2xl border border-emerald-900/10 bg-white px-4 py-3 text-sm text-emerald-900/70">
									<ShieldCheck className="h-4 w-4 text-lime-700" />
									Secure access for your cafe operations and forecasting tools.
								</div>
							</div>
						</div>
					</div>

					<aside className="relative order-1 overflow-hidden bg-[linear-gradient(180deg,rgba(236,252,203,0.8),rgba(255,255,255,0.95))] px-6 py-12 sm:px-10 lg:order-2 lg:px-12 lg:py-16">
						<div className="absolute inset-0 opacity-50 [background-image:radial-gradient(rgba(84,138,47,0.08)_1px,transparent_1px)] [background-size:24px_24px]" />

						<div className="relative flex h-full min-h-[32rem] flex-col justify-between rounded-[2rem] border border-emerald-900/10 bg-white/70 p-6 shadow-sm shadow-emerald-950/5 backdrop-blur-sm sm:p-8">
							<div>
								<p className="text-xs uppercase tracking-[0.45em] text-lime-700/65">Brewed with care</p>
								<h2 className="mt-4 max-w-xl text-4xl font-semibold tracking-tight text-emerald-950 sm:text-5xl">
									A calm workspace for a sharper morning routine.
								</h2>
								<p className="mt-5 max-w-lg text-sm leading-6 text-emerald-900/65 sm:text-base">
									Keep your team, menu, and forecasting tools in one place with a visual style that feels light and easy on the eyes.
								</p>
							</div>

							<div className="grid gap-4 sm:grid-cols-2">
								<div className="rounded-3xl border border-emerald-900/10 bg-white p-4">
									<p className="text-xs uppercase tracking-[0.3em] text-lime-700/60">Daily momentum</p>
									<p className="mt-3 text-3xl font-semibold text-emerald-950">+18%</p>
									<p className="mt-2 text-sm text-emerald-900/65">More consistent service flow with a cleaner, focused interface.</p>
								</div>
								<div className="rounded-3xl border border-emerald-900/10 bg-white p-4">
									<p className="text-xs uppercase tracking-[0.3em] text-lime-700/60">Trusted by teams</p>
									<p className="mt-3 text-3xl font-semibold text-emerald-950">24/7</p>
									<p className="mt-2 text-sm text-emerald-900/65">Stable access to the tools your cafe relies on every shift.</p>
								</div>
							</div>
						</div>
					</aside>
				</section>
			</div>
		</main>
	);
}

export default Login;
