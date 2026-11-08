import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';

import { useAuth } from '../lib/auth';
import { ROLE_HOME } from '../lib/format';
import { Field } from '../components/ui';

const SEEDED = [
  { label: 'Admin', email: 'admin@signque.in', password: 'Admin@123' },
  { label: 'Designer', email: 'designer1@signque.in', password: 'Designer@123' },
  { label: 'Printing', email: 'printer1@signque.in', password: 'Printer@123' },
  { label: 'Customer', email: 'customer@signque.in', password: 'Customer@123' },
];

export default function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to={ROLE_HOME[user.role] || '/'} replace />;

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const signedIn = await login(form);
      // The role decides which area opens.
      navigate(location.state?.from || ROLE_HOME[signedIn.role] || '/', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-sm">
      <h1 className="text-2xl font-bold">Sign in</h1>
      <p className="mt-1 text-sm text-ink-faint">
        Your role decides which panel opens after you sign in.
      </p>

      <form onSubmit={submit} className="card-pad mt-6 space-y-4">
        <Field label="Email">
          <input
            type="email"
            required
            autoComplete="email"
            className="input"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
        </Field>

        <Field label="Password">
          <input
            type="password"
            required
            autoComplete="current-password"
            className="input"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
        </Field>

        {error && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </p>
        )}

        <button type="submit" className="btn-primary w-full" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>

        <p className="text-center text-sm text-ink-faint">
          New here?{' '}
          <Link to="/register" className="font-semibold text-ink underline">
            Create an account
          </Link>
        </p>
      </form>

      <div className="card-pad mt-4">
        <p className="label">Seeded accounts</p>
        <div className="grid grid-cols-2 gap-2">
          {SEEDED.map((account) => (
            <button
              key={account.email}
              type="button"
              className="btn-secondary btn-sm justify-start"
              onClick={() => setForm({ email: account.email, password: account.password })}
            >
              {account.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
