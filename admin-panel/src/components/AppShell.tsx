import {
  Avatar,
  Box,
  Drawer,
  Group,
  Menu,
  Modal,
  Popover,
  Stack,
  Text,
  TextInput,
  Tooltip,
  useMantineColorScheme,
} from '@mantine/core';
import {
  IconBell,
  IconChevronRight,
  IconLanguage,
  IconLogout,
  IconMenu2,
  IconMoon,
  IconSearch,
  IconSun,
  IconUser,
} from '@tabler/icons-react';
import { useRef, useState, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useCounts } from '../api/hooks';
import { initials, useAuth } from '../auth';
import { LANGUAGES } from '../i18n';
import { NAV, isChildActive, isGroupActive, type BadgeKey, type NavGroup } from '../nav';

type Counts = Partial<Record<BadgeKey, number>>;

/* ------------------------------------------------------------------ *
 * Left rail: icon only, never expands, one flyout per nav group.
 * ------------------------------------------------------------------ */

function RailGroup({ group, counts }: { group: NavGroup; counts: Counts }) {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const [opened, setOpened] = useState(false);
  const timer = useRef<number | null>(null);

  const open = () => {
    if (timer.current) window.clearTimeout(timer.current);
    setOpened(true);
  };
  const close = () => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setOpened(false), 130);
  };

  const active = isGroupActive(location.pathname, group);
  const GroupIcon = group.icon;
  const groupUnread = group.badge ? (counts[group.badge] ?? 0) : 0;

  return (
    <Popover
      opened={opened}
      onChange={setOpened}
      position="right-start"
      offset={14}
      radius="lg"
      shadow="none"
      withinPortal
      trapFocus={false}
    >
      <Popover.Target>
        <button
          type="button"
          aria-label={t(group.labelKey)}
          className={`rail__btn ${active ? 'rail__btn--active' : ''}`}
          onMouseEnter={open}
          onMouseLeave={close}
          onFocus={open}
          onClick={() => {
            if (opened) {
              navigate(group.children[0]!.path);
              setOpened(false);
            } else {
              open();
            }
          }}
        >
          <GroupIcon size={21} stroke={1.7} />
          {groupUnread > 0 && <span className="dot" />}
        </button>
      </Popover.Target>
      <Popover.Dropdown p={0} onMouseEnter={open} onMouseLeave={close}>
        <div className="flyout">
          <div className="flyout__label">{t(group.labelKey)}</div>
          {group.children.map((child) => {
            const childActive = isChildActive(location.pathname, child.path);
            const unread = child.badge ? (counts[child.badge] ?? 0) : 0;
            return (
              <Link
                key={child.path}
                to={child.path}
                className={`flyout__item ${childActive ? 'flyout__item--active' : ''}`}
                onClick={() => setOpened(false)}
              >
                <span>{t(child.labelKey)}</span>
                {unread > 0 ? <span className="dot" /> : <IconChevronRight size={14} stroke={1.8} style={{ marginLeft: 'auto', opacity: 0.4 }} />}
              </Link>
            );
          })}
        </div>
      </Popover.Dropdown>
    </Popover>
  );
}

function Rail({ counts }: { counts: Counts }) {
  return (
    <nav className="rail" aria-label="Sections">
      {NAV.map((group, index) => (
        <Box key={group.id} style={{ display: 'contents' }}>
          {index === NAV.length - 1 && <span className="rail__divider" />}
          <RailGroup group={group} counts={counts} />
        </Box>
      ))}
    </nav>
  );
}

/* ------------------------------------------------------------------ *
 * Theme toggle: circular reveal via startViewTransition.
 * ------------------------------------------------------------------ */

function ThemeCapsule() {
  const { colorScheme, setColorScheme } = useMantineColorScheme();
  const { t } = useTranslation();
  const ref = useRef<HTMLButtonElement>(null);
  const dark = colorScheme !== 'light';

  const toggle = () => {
    const next = dark ? 'light' : 'dark';
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const start = (document as Document & { startViewTransition?: (cb: () => void) => { ready: Promise<void> } })
      .startViewTransition;

    if (!start || reduced || !ref.current) {
      setColorScheme(next);
      return;
    }

    const rect = ref.current.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));

    const transition = start.call(document, () => {
      flushSync(() => setColorScheme(next));
    });

    void transition.ready.then(() => {
      document.documentElement.animate(
        {
          clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`],
        },
        {
          duration: 520,
          easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
          pseudoElement: '::view-transition-new(root)',
        },
      );
    });
  };

  return (
    <Tooltip label={t('common.theme')} withArrow>
      <button ref={ref} type="button" className="capsule capsule--theme" onClick={toggle} aria-label={t('common.theme')}>
        {dark ? <IconSun size={18} stroke={1.7} /> : <IconMoon size={18} stroke={1.7} />}
      </button>
    </Tooltip>
  );
}

function LanguageCapsule() {
  const { t, i18n } = useTranslation();
  const current = LANGUAGES.find((language) => language.code === i18n.resolvedLanguage) ?? LANGUAGES[0];

  return (
    <Menu position="bottom-end" radius="lg" shadow="none" width={180}>
      <Menu.Target>
        <button type="button" className="capsule capsule--wide capsule--lang" aria-label={t('common.language')}>
          <IconLanguage size={17} stroke={1.7} />
          {current.short}
        </button>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Label>{t('common.language')}</Menu.Label>
        {LANGUAGES.map((language) => (
          <Menu.Item key={language.code} onClick={() => void i18n.changeLanguage(language.code)}>
            <Group justify="space-between">
              <span>{language.label}</span>
              {language.code === current.code && (
                <Text fz={11} c="dimmed">
                  {language.short}
                </Text>
              )}
            </Group>
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  );
}

function NotificationCapsule() {
  const { t } = useTranslation();
  const items = [
    { key: 'handoff', tone: 'var(--ss-alert)' },
    { key: 'payment', tone: 'var(--ss-accent-purple)' },
    { key: 'stock', tone: 'var(--ss-accent-teal)' },
  ];

  return (
    <Popover position="bottom-end" radius="lg" shadow="none" width={300} withinPortal>
      <Popover.Target>
        <button type="button" className="capsule" aria-label={t('common.notifications')}>
          <IconBell size={18} stroke={1.7} />
          <span className="dot" />
        </button>
      </Popover.Target>
      <Popover.Dropdown p={0}>
        <Group justify="space-between" px="md" py="sm" className="surface-header">
          <Text fw={700} fz="sm">
            {t('common.notifications')}
          </Text>
          <Text fz={11} c="dimmed" style={{ cursor: 'pointer' }}>
            {t('common.markAllRead')}
          </Text>
        </Group>
        <Stack gap={0} p={6}>
          {items.map((item) => (
            <Group key={item.key} gap={10} align="flex-start" className="flyout__item" wrap="nowrap">
              <Box w={8} h={8} mt={6} style={{ borderRadius: 999, background: item.tone, flex: '0 0 auto' }} />
              <Stack gap={2}>
                <Text fz="sm" fw={500}>
                  {t(`notifications.${item.key}`)}
                </Text>
                <Text fz={11} c="dimmed">
                  {t(`notifications.${item.key}Body`)}
                </Text>
              </Stack>
            </Group>
          ))}
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}

function SearchCapsule() {
  const { t } = useTranslation();
  const [opened, setOpened] = useState(false);
  const [query, setQuery] = useState('');
  const navigate = useNavigate();

  const targets = NAV.flatMap((group) =>
    group.children.map((child) => ({ path: child.path, label: `${t(group.labelKey)} · ${t(child.labelKey)}` })),
  );
  const matches = targets.filter((target) => target.label.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <>
      <button type="button" className="capsule capsule--search" onClick={() => setOpened(true)}>
        <IconSearch size={16} stroke={1.8} />
        {t('common.search')}
      </button>
      <Modal opened={opened} onClose={() => setOpened(false)} withCloseButton={false} size="lg" padding={0} radius="xl">
        <Box p="md">
          <TextInput
            autoFocus
            size="md"
            radius="md"
            variant="unstyled"
            placeholder={t('common.searchPlaceholder')}
            leftSection={<IconSearch size={18} stroke={1.8} />}
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
          />
        </Box>
        <Box className="surface-header" style={{ borderTop: '1px solid var(--ss-border)', borderBottom: 0 }} p={6}>
          {matches.length === 0 ? (
            <Text c="dimmed" fz="sm" p="md">
              {t('common.searchHint')}
            </Text>
          ) : (
            matches.slice(0, 7).map((match) => (
              <button
                key={match.path}
                type="button"
                className="flyout__item"
                style={{ width: '100%', border: 0, background: 'transparent', textAlign: 'left' }}
                onClick={() => {
                  navigate(match.path);
                  setOpened(false);
                  setQuery('');
                }}
              >
                <IconChevronRight size={14} stroke={1.8} style={{ opacity: 0.45 }} />
                {match.label}
              </button>
            ))
          )}
        </Box>
      </Modal>
    </>
  );
}

function AvatarMenu() {
  const { t } = useTranslation();
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  return (
    <Menu position="bottom-end" radius="lg" shadow="none" width={220}>
      <Menu.Target>
        <button type="button" className="capsule" aria-label={t('common.profile')} style={{ padding: 0 }}>
          <Avatar size={38} radius="xl" color="brand" variant="gradient" gradient={{ from: 'brand.6', to: 'violet.6', deg: 140 }}>
            {initials(user?.name ?? 'Admin')}
          </Avatar>
        </button>
      </Menu.Target>
      <Menu.Dropdown>
        <Stack gap={0} px="sm" py={8}>
          <Text fz="sm" fw={600}>
            {user?.name}
          </Text>
          <Text fz={11} c="dimmed">
            {user?.email}
          </Text>
        </Stack>
        <Menu.Divider />
        <Menu.Item leftSection={<IconUser size={15} stroke={1.7} />} onClick={() => navigate('/settings')}>
          {t('common.profile')}
        </Menu.Item>
        <Menu.Item
          color="red"
          leftSection={<IconLogout size={15} stroke={1.7} />}
          onClick={() => {
            signOut();
            navigate('/login');
          }}
        >
          {t('common.signOut')}
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}

/* ------------------------------------------------------------------ *
 * Top bar
 * ------------------------------------------------------------------ */

function TopTabs({ counts }: { counts: Counts }) {
  const { t } = useTranslation();
  const location = useLocation();

  return (
    <div className="toptabs" role="tablist">
      {NAV.filter((group) => group.topTab).map((group) => {
        const active = isGroupActive(location.pathname, group);
        const count = group.badge ? (counts[group.badge] ?? 0) : 0;
        return (
          <Link
            key={group.id}
            to={group.children[0]!.path}
            role="tab"
            aria-selected={active}
            className={`toptab ${active ? 'toptab--active' : ''}`}
          >
            {t(group.labelKey)}
            {count > 0 && <span className="toptab__count">{count}</span>}
          </Link>
        );
      })}
    </div>
  );
}

function BurgerDrawer({ counts }: { counts: Counts }) {
  const { t } = useTranslation();
  const [opened, setOpened] = useState(false);
  const location = useLocation();
  const { colorScheme, setColorScheme } = useMantineColorScheme();
  const { i18n } = useTranslation();

  return (
    <>
      <button type="button" className="capsule burger" aria-label={t('common.menu')} onClick={() => setOpened(true)}>
        <IconMenu2 size={18} stroke={1.8} />
      </button>
      <Drawer opened={opened} onClose={() => setOpened(false)} position="right" size="82%" title={t('common.menu')} padding="md">
        <Stack gap="lg">
          {NAV.map((group) => (
            <Stack key={group.id} gap={4}>
              <div className="flyout__label">{t(group.labelKey)}</div>
              {group.children.map((child) => {
                const active = isChildActive(location.pathname, child.path);
                const unread = child.badge ? (counts[child.badge] ?? 0) : 0;
                return (
                  <Link
                    key={child.path}
                    to={child.path}
                    className={`drawer-link ${active ? 'drawer-link--active' : ''}`}
                    onClick={() => setOpened(false)}
                  >
                    {t(child.labelKey)}
                    {unread > 0 && (
                      <span className="toptab__count" style={{ marginLeft: 'auto' }}>
                        {unread}
                      </span>
                    )}
                  </Link>
                );
              })}
            </Stack>
          ))}
          <Group gap="sm">
            <button
              type="button"
              className="capsule"
              onClick={() => setColorScheme(colorScheme === 'light' ? 'dark' : 'light')}
              aria-label={t('common.theme')}
            >
              {colorScheme === 'light' ? <IconMoon size={18} stroke={1.7} /> : <IconSun size={18} stroke={1.7} />}
            </button>
            {LANGUAGES.map((language) => (
              <button
                key={language.code}
                type="button"
                className="capsule capsule--wide"
                onClick={() => void i18n.changeLanguage(language.code)}
              >
                {language.short}
              </button>
            ))}
          </Group>
        </Stack>
      </Drawer>
    </>
  );
}

function TopBar({ counts }: { counts: Counts }) {
  const { t } = useTranslation();
  return (
    <div className="topbar">
      <div className="topbar__inner">
        <Link to="/" className="brandmark" aria-label={t('brand.name')}>
          {t('brand.mark')}
        </Link>
        <TopTabs counts={counts} />
        <Group gap="sm" ml="auto" wrap="nowrap">
          <SearchCapsule />
          <NotificationCapsule />
          <ThemeCapsule />
          <LanguageCapsule />
          <AvatarMenu />
          <BurgerDrawer counts={counts} />
        </Group>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Shell
 * ------------------------------------------------------------------ */

export function AppShell({ children }: { children?: ReactNode }) {
  const { data } = useCounts();
  const counts: Counts = data ?? {};

  return (
    <>
      <TopBar counts={counts} />
      <div className="shell">
        <Rail counts={counts} />
        <main className="shell__main">{children ?? <Outlet />}</main>
      </div>
    </>
  );
}
