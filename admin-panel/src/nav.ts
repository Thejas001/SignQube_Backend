import {
  IconBrandWhatsapp,
  IconLayoutDashboard,
  IconPackage,
  IconSettings,
  IconShoppingBag,
  IconUsers,
  type Icon,
} from '@tabler/icons-react';

export type BadgeKey = 'handoff' | 'pendingOrders' | 'failedPayments';

export type NavChild = {
  path: string;
  labelKey: string;
  badge?: BadgeKey;
};

export type NavGroup = {
  id: string;
  labelKey: string;
  icon: Icon;
  children: NavChild[];
  /** also shown as a tab in the top bar */
  topTab?: boolean;
  badge?: BadgeKey;
};

export const NAV: NavGroup[] = [
  {
    id: 'dashboard',
    labelKey: 'nav.dashboard',
    icon: IconLayoutDashboard,
    topTab: true,
    children: [
      { path: '/', labelKey: 'nav.overview' },
      { path: '/agent-analytics', labelKey: 'nav.agentAnalytics' },
    ],
  },
  {
    id: 'orders',
    labelKey: 'nav.orders',
    icon: IconShoppingBag,
    topTab: true,
    badge: 'pendingOrders',
    children: [
      { path: '/orders', labelKey: 'nav.allOrders', badge: 'pendingOrders' },
      { path: '/payments', labelKey: 'nav.payments', badge: 'failedPayments' },
    ],
  },
  {
    id: 'catalog',
    labelKey: 'nav.catalog',
    icon: IconPackage,
    topTab: true,
    children: [
      { path: '/products', labelKey: 'nav.products' },
      { path: '/customizations', labelKey: 'nav.customizations' },
    ],
  },
  {
    id: 'whatsapp',
    labelKey: 'nav.whatsapp',
    icon: IconBrandWhatsapp,
    topTab: true,
    badge: 'handoff',
    children: [
      { path: '/conversations', labelKey: 'nav.conversations' },
      { path: '/handoffs', labelKey: 'nav.handoffs', badge: 'handoff' },
      { path: '/agent-settings', labelKey: 'nav.agentSettings' },
    ],
  },
  {
    id: 'customers',
    labelKey: 'nav.customers',
    icon: IconUsers,
    children: [{ path: '/customers', labelKey: 'nav.customerList' }],
  },
  {
    id: 'settings',
    labelKey: 'nav.settings',
    icon: IconSettings,
    children: [{ path: '/settings', labelKey: 'nav.team' }],
  },
];

export function isChildActive(pathname: string, path: string): boolean {
  if (path === '/') return pathname === '/';
  return pathname === path || pathname.startsWith(`${path}/`);
}

export function isGroupActive(pathname: string, group: NavGroup): boolean {
  return group.children.some((child) => isChildActive(pathname, child.path));
}
