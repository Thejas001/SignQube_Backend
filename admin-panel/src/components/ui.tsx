import {
  Badge,
  Box,
  Center,
  Group,
  Loader,
  Paper,
  Select,
  Stack,
  Text,
  ThemeIcon,
  type MantineColor,
} from '@mantine/core';
import type { Icon } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import type { CSSProperties, ReactNode } from 'react';

/* ------------------------------ Surface ------------------------------ */

export function Surface({
  children,
  style,
  className,
}: {
  children: ReactNode;
  style?: CSSProperties;
  className?: string;
}) {
  return (
    <Paper radius="xl" withBorder className={`glass ${className ?? ''}`} style={style}>
      {children}
    </Paper>
  );
}

export function SurfaceHeader({
  title,
  count,
  right,
}: {
  title: ReactNode;
  count?: number;
  right?: ReactNode;
}) {
  return (
    <Group justify="space-between" wrap="nowrap" px="xl" py="md" className="surface-header">
      <Group gap="xs" wrap="nowrap">
        <Text fw={700} fz="sm" style={{ letterSpacing: '-0.01em' }}>
          {title}
        </Text>
        {typeof count === 'number' && (
          <Text component="span" className="count-chip" fz={11} fw={700} px={8} py={2} style={{ borderRadius: 999 }}>
            {count}
          </Text>
        )}
      </Group>
      {right}
    </Group>
  );
}

export function ListRow({
  children,
  onClick,
  py = 'md',
}: {
  children: ReactNode;
  onClick?: () => void;
  py?: string | number;
}) {
  return (
    <Box
      px="xl"
      py={py}
      className={`listrow ${onClick ? 'listrow--click' : ''}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onClick();
              }
            }
          : undefined
      }
    >
      {children}
    </Box>
  );
}

/* ------------------------------ PageHeader ------------------------------ */

export function PageHeader({
  kicker,
  title,
  description,
  actions,
}: {
  kicker?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="pagehead">
      <div style={{ minWidth: 0 }}>
        {kicker && <div className="pagehead__kicker">{kicker}</div>}
        <h1 className="pagehead__title">{title}</h1>
        {description && <p className="pagehead__desc">{description}</p>}
      </div>
      {actions && <Group gap="sm">{actions}</Group>}
    </header>
  );
}

/* ------------------------------ metrics ------------------------------ */

export function MetricCard({
  label,
  value,
  icon: IconComponent,
  tone = 'brand',
  hint,
}: {
  label: string;
  value: ReactNode;
  icon: Icon;
  tone?: MantineColor;
  hint?: string;
}) {
  return (
    <Paper radius="lg" withBorder className="glass" p="lg">
      <Group justify="space-between" wrap="nowrap" align="flex-start">
        <Stack gap={2} style={{ minWidth: 0 }}>
          <Text fz="sm" c="dimmed">
            {label}
          </Text>
          <Text fz={22} fw={700} style={{ letterSpacing: '-0.02em', lineHeight: 1.2 }}>
            {value}
          </Text>
          {hint && (
            <Text fz={11} c="dimmed">
              {hint}
            </Text>
          )}
        </Stack>
        <ThemeIcon variant="light" color={tone} radius="xl" size={36} className="kpi-ring">
          <IconComponent size={18} stroke={1.7} />
        </ThemeIcon>
      </Group>
    </Paper>
  );
}

export function StatTile({ label, value }: { label: string; value: ReactNode }) {
  return (
    <Stack gap={4}>
      <Text fz="xs" fw={600} c="dimmed" tt="uppercase" style={{ letterSpacing: '0.08em' }}>
        {label}
      </Text>
      <Text fz={26} fw={800} style={{ letterSpacing: '-0.02em', lineHeight: 1.1 }}>
        {value}
      </Text>
    </Stack>
  );
}

/* ------------------------------ status badges ------------------------------ */

export const STATUS_TONE: Record<string, MantineColor> = {
  /* orders */
  PENDING: 'yellow',
  PROCESSING: 'blue',
  SHIPPED: 'cyan',
  DELIVERED: 'green',
  CANCELLED: 'gray',
  /* payments */
  SUCCESS: 'green',
  FAILED: 'red',
  REFUNDED: 'orange',
  /* conversations */
  DISCOVERY: 'blue',
  PRODUCT_RECOMMENDATION: 'blue',
  PRODUCT_SELECTED: 'blue',
  CUSTOMIZATION: 'blue',
  PHOTO_REQUIRED: 'yellow',
  ADDRESS_REQUIRED: 'yellow',
  ORDER_READY: 'teal',
  PAYMENT_PENDING: 'yellow',
  PAID: 'cyan',
  COMPLETED: 'green',
  HUMAN_HANDOFF: 'red',
  /* artwork checks */
  PASSED: 'green',
  FLAGGED: 'yellow',
  REJECTED: 'red',
  /* misc */
  WEB: 'gray',
  WHATSAPP: 'teal',
  ACTIVE: 'teal',
  DRAFT: 'gray',
};

export function StatusBadge({ value, size = 'sm' }: { value: string; size?: string }) {
  const { t } = useTranslation();
  return (
    <Badge variant="light" radius="xl" size={size} color={STATUS_TONE[value] ?? 'gray'}>
      {t(`status.${value}`, { defaultValue: value })}
    </Badge>
  );
}

/* ------------------------------ filters ------------------------------ */

export type FilterOption = { value: string; label: string; count?: number; color?: string };

export function FilterTile({
  label,
  value,
  options,
  onChange,
  width = 280,
}: {
  label: string;
  value: string;
  options: FilterOption[];
  onChange: (next: string) => void;
  width?: number;
}) {
  const colors = new Map(options.map((option) => [option.value, option.color ?? 'var(--ss-muted)']));
  const data = options.map((option) => ({
    value: option.value,
    label: typeof option.count === 'number' ? `${option.label} (${option.count})` : option.label,
  }));

  return (
    <Select
      aria-label={label}
      placeholder={label}
      radius="xl"
      value={value}
      data={data}
      onChange={(next) => onChange(next ?? 'ALL')}
      allowDeselect={false}
      maw={width}
      style={{ flex: `0 1 ${width}px` }}
      comboboxProps={{ radius: 'lg', shadow: 'none' }}
      leftSection={<Dot color={colors.get(value) ?? 'var(--ss-muted)'} />}
      renderOption={({ option, checked }) => (
        <Group gap={10} wrap="nowrap" style={{ width: '100%' }}>
          <Dot color={colors.get(option.value) ?? 'var(--ss-muted)'} />
          <Text fz="sm" fw={checked ? 600 : 400}>
            {option.label}
          </Text>
        </Group>
      )}
    />
  );
}

function Dot({ color }: { color: string }) {
  return (
    <Box
      w={9}
      h={9}
      style={{
        borderRadius: 999,
        background: color,
        boxShadow: `0 0 0 3px color-mix(in srgb, ${color} 22%, transparent)`,
      }}
    />
  );
}

/* tone name -> css colour, used to tint filter dots */
export function toneColor(status: string): string {
  const tone = STATUS_TONE[status] ?? 'gray';
  return `var(--mantine-color-${tone}-6)`;
}

/* ------------------------------ states ------------------------------ */

export function EmptyState({ label }: { label?: string }) {
  const { t } = useTranslation();
  return (
    <Center py="xl">
      <Text c="dimmed" fz="sm" ta="center">
        {label ?? t('common.empty')}
      </Text>
    </Center>
  );
}

export function Loading({ py = 'xl' }: { py?: string | number }) {
  return (
    <Center py={py}>
      <Loader size="sm" type="dots" />
    </Center>
  );
}
