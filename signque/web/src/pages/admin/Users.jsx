import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import { api } from '../../lib/api';
import { dateOnly, ROLE_LABEL } from '../../lib/format';
import { Spinner, ErrorPanel, PageHeader, Field, Toast } from '../../components/ui';

const EMPTY = { name: '', email: '', phone: '', password: '', role: 'DESIGNER' };

export default function Users() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(EMPTY);
  const [showForm, setShowForm] = useState(false);
  const [toast, setToast] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [roleFilter, setRoleFilter] = useState('');

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['admin-users', roleFilter],
    // ?role=DESIGNER|PRINTER returns the dropdown shape, so the table uses a
    // separate filter parameter the API paginates.
    queryFn: () =>
      api.get(`/admin/users?pageSize=100${roleFilter ? `&role=${roleFilter}` : ''}`),
  });

  const create = useMutation({
    mutationFn: () => {
      const payload = { ...form };
      if (!payload.phone) delete payload.phone;
      return api.post('/admin/users', payload);
    },
    onMutate: () => setActionError(null),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      await queryClient.invalidateQueries({ queryKey: ['assignable'] });
      setForm(EMPTY);
      setShowForm(false);
      setToast({ message: 'Account created.', tone: 'ok' });
    },
    onError: (err) => setActionError(err),
  });

  const toggleActive = useMutation({
    mutationFn: ({ id, isActive }) => api.patch(`/admin/users/${id}`, { isActive }),
    onSuccess: async (_result, variables) => {
      await queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      await queryClient.invalidateQueries({ queryKey: ['assignable'] });
      setToast({
        message: variables.isActive ? 'Account reactivated.' : 'Account deactivated.',
        tone: 'ok',
      });
    },
    onError: (err) => setActionError(err),
  });

  // A role-filtered response uses `users`; the unfiltered one is paginated as `items`.
  const users = data?.items || data?.users || [];

  return (
    <div>
      <Toast message={toast?.message} tone={toast?.tone} onDone={() => setToast(null)} />

      <PageHeader
        title="Users"
        subtitle="Create and deactivate designer, printing and admin accounts. Customers register themselves."
        actions={
          <button type="button" className="btn-primary btn-sm" onClick={() => setShowForm((v) => !v)}>
            {showForm ? 'Close' : 'New account'}
          </button>
        }
      />

      {actionError && (
        <div className="mb-4">
          <ErrorPanel error={actionError} />
        </div>
      )}

      {showForm && (
        <form
          className="card-pad mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <Field label="Name">
            <input
              required
              className="input"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </Field>
          <Field label="Email">
            <input
              required
              type="email"
              className="input"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </Field>
          <Field label="Phone" hint="Optional.">
            <input
              className="input"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </Field>
          <Field label="Role">
            <select
              className="input"
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
            >
              <option value="DESIGNER">Designer</option>
              <option value="PRINTER">Printing user</option>
              <option value="ADMIN">Admin</option>
            </select>
          </Field>
          <div className="sm:col-span-2">
            <Field label="Password" hint="At least 8 characters. Share it with them securely.">
              <input
                required
                minLength={8}
                type="password"
                className="input"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <button type="submit" className="btn-primary" disabled={create.isPending}>
              {create.isPending ? 'Creating…' : 'Create account'}
            </button>
          </div>
        </form>
      )}

      <div className="mb-4 flex flex-wrap gap-2">
        {['', 'ADMIN', 'DESIGNER', 'PRINTER', 'CUSTOMER'].map((role) => (
          <button
            key={role || 'all'}
            type="button"
            onClick={() => setRoleFilter(role)}
            className={`chip ${
              roleFilter === role
                ? 'border-ink bg-ink text-stone-50'
                : 'border-stone-300 bg-white text-ink-soft hover:bg-stone-100'
            }`}
          >
            {role ? ROLE_LABEL[role] : 'All'}
          </button>
        ))}
      </div>

      {isLoading ? (
        <Spinner />
      ) : error ? (
        <ErrorPanel error={error} onRetry={refetch} />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-stone-200 bg-stone-50 text-left">
              <tr>
                <th className="px-3 py-2 text-xs font-semibold uppercase text-ink-faint">Name</th>
                <th className="px-3 py-2 text-xs font-semibold uppercase text-ink-faint">Role</th>
                <th className="px-3 py-2 text-xs font-semibold uppercase text-ink-faint">Email</th>
                <th className="px-3 py-2 text-xs font-semibold uppercase text-ink-faint">Open jobs</th>
                <th className="px-3 py-2 text-xs font-semibold uppercase text-ink-faint">Joined</th>
                <th className="px-3 py-2 text-xs font-semibold uppercase text-ink-faint">Status</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className="border-b border-stone-100 last:border-0">
                  <td className="px-3 py-2.5 font-medium">{user.name}</td>
                  <td className="px-3 py-2.5">{ROLE_LABEL[user.role]}</td>
                  <td className="px-3 py-2.5 text-ink-soft">{user.email}</td>
                  <td className="px-3 py-2.5 text-ink-soft">
                    {user.openJobs === undefined ? '—' : user.openJobs}
                  </td>
                  <td className="px-3 py-2.5 text-ink-soft">{dateOnly(user.createdAt)}</td>
                  <td className="px-3 py-2.5">
                    <span
                      className={`chip ${
                        user.isActive
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                          : 'border-stone-300 bg-stone-100 text-stone-600'
                      }`}
                    >
                      {user.isActive ? 'Active' : 'Deactivated'}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <button
                      type="button"
                      className={user.isActive ? 'btn-danger btn-sm' : 'btn-secondary btn-sm'}
                      disabled={toggleActive.isPending}
                      onClick={() => toggleActive.mutate({ id: user.id, isActive: !user.isActive })}
                    >
                      {user.isActive ? 'Deactivate' : 'Reactivate'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
