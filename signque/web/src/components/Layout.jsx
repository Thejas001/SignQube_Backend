/** The shell every area shares: brand, nav for the user's role, notification bell. */

import { useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { ROLE_LABEL, dateTime } from '../lib/format';

const NAV = {
  CUSTOMER: [
    { to: '/', label: 'Shop', end: true },
    { to: '/orders', label: 'My orders' },
  ],
  ADMIN: [
    { to: '/admin', label: 'Dashboard', end: true },
    { to: '/admin/orders', label: 'Orders' },
    { to: '/admin/users', label: 'Users' },
    { to: '/admin/products', label: 'Products' },
  ],
  DESIGNER: [{ to: '/designer', label: 'My jobs', end: true }],
  PRINTER: [{ to: '/printer', label: 'My jobs', end: true }],
};

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  const links = user ? NAV[user.role] || [] : [];

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-stone-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
          <Link to="/" className="shrink-0 text-base font-black tracking-[0.18em]">
            SIGNQUE
          </Link>

          {user && (
            <span className="hidden rounded-full border border-stone-300 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-ink-faint sm:inline">
              {ROLE_LABEL[user.role]}
            </span>
          )}

          <nav className="ml-auto hidden items-center gap-1 sm:flex">
            {links.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.end}
                className={({ isActive }) =>
                  `rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                    isActive ? 'bg-stone-100 text-ink' : 'text-ink-soft hover:bg-stone-50'
                  }`
                }
              >
                {link.label}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2 sm:ml-0">
            {user ? (
              <>
                <NotificationBell />
                <button
                  type="button"
                  className="btn-secondary btn-sm hidden sm:inline-flex"
                  onClick={async () => {
                    await logout();
                    navigate('/login');
                  }}
                >
                  Sign out
                </button>
                <button
                  type="button"
                  aria-label="Menu"
                  className="btn-secondary btn-sm sm:hidden"
                  onClick={() => setMenuOpen((v) => !v)}
                >
                  ☰
                </button>
              </>
            ) : (
              <Link to="/login" className="btn-primary btn-sm">
                Sign in
              </Link>
            )}
          </div>
        </div>

        {user && menuOpen && (
          <nav className="border-t border-stone-200 bg-white px-4 py-2 sm:hidden">
            {links.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.end}
                onClick={() => setMenuOpen(false)}
                className={({ isActive }) =>
                  `block rounded-lg px-3 py-2 text-sm ${isActive ? 'bg-stone-100 font-semibold' : 'text-ink-soft'}`
                }
              >
                {link.label}
              </NavLink>
            ))}
            <button
              type="button"
              className="mt-1 block w-full rounded-lg px-3 py-2 text-left text-sm text-ink-soft"
              onClick={async () => {
                setMenuOpen(false);
                await logout();
                navigate('/login');
              }}
            >
              Sign out
            </button>
          </nav>
        )}
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:py-8">
        <Outlet />
      </main>

      <footer className="mx-auto max-w-6xl px-4 pb-8 pt-4 text-xs text-stone-400">
        SIGNQUE — custom acrylic photo frames.
      </footer>
    </div>
  );
}

function NotificationBell() {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api.get('/notifications'),
    refetchInterval: 30000,
  });

  const markRead = useMutation({
    mutationFn: (id) => api.patch(`/notifications/${id}/read`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const markAll = useMutation({
    mutationFn: () => api.patch('/notifications/read-all'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const unread = data?.unreadCount || 0;
  const items = data?.items || [];

  return (
    <div className="relative">
      <button
        type="button"
        className="btn-secondary btn-sm relative"
        onClick={() => setOpen((v) => !v)}
        aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}
      >
        <span aria-hidden="true">🔔</span>
        {unread > 0 && (
          <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-label="Close notifications"
            className="fixed inset-0 z-40 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 z-50 mt-2 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-stone-200 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-stone-200 px-3 py-2">
              <p className="text-sm font-semibold">Notifications</p>
              {unread > 0 && (
                <button
                  type="button"
                  className="text-xs font-semibold text-ink-faint hover:text-ink"
                  onClick={() => markAll.mutate()}
                >
                  Mark all read
                </button>
              )}
            </div>

            <div className="max-h-80 overflow-y-auto">
              {items.length === 0 ? (
                <p className="px-3 py-8 text-center text-sm text-ink-faint">Nothing yet.</p>
              ) : (
                items.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => !item.isRead && markRead.mutate(item.id)}
                    className={`block w-full border-b border-stone-100 px-3 py-2.5 text-left last:border-0 hover:bg-stone-50 ${
                      item.isRead ? '' : 'bg-stone-50/80'
                    }`}
                  >
                    <p className="flex items-center gap-2 text-sm font-medium">
                      {!item.isRead && <span className="h-1.5 w-1.5 rounded-full bg-ink" />}
                      {item.title}
                    </p>
                    <p className="mt-0.5 text-xs text-ink-soft">{item.message}</p>
                    <p className="mt-1 text-[11px] text-stone-400">{dateTime(item.createdAt)}</p>
                  </button>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
