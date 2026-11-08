import { Button, Group, SimpleGrid, Stack, Text } from '@mantine/core';
import {
  IconArrowUpRight,
  IconCoin,
  IconCpu,
  IconMessage2,
  IconPlus,
  IconShoppingBag,
  IconTrendingUp,
  IconUrgent,
} from '@tabler/icons-react';
import dayjs from 'dayjs';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { useLiveConversations, useMetrics, useRecentOrders } from '../api/hooks';
import { compact, money } from '../api/mock';
import { EmptyState, ListRow, Loading, MetricCard, PageHeader, StatusBadge, Surface, SurfaceHeader } from '../components/ui';

export default function Dashboard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const metrics = useMetrics();
  const orders = useRecentOrders(6);
  const chats = useLiveConversations(6);

  return (
    <>
      <PageHeader
        kicker={t('dashboard.kicker')}
        title={t('dashboard.title')}
        description={t('dashboard.description')}
        actions={
          <>
            <Button variant="default" component={Link} to="/orders">
              {t('common.viewAll')}
            </Button>
            <Button leftSection={<IconPlus size={16} stroke={2} />} onClick={() => navigate('/products')}>
              {t('products.new')}
            </Button>
          </>
        }
      />

      <SimpleGrid cols={{ base: 1, xs: 2, sm: 3, lg: 6 }} spacing="md" mb="lg">
        <MetricCard
          label={t('dashboard.revenue')}
          value={metrics.data ? money(metrics.data.revenue) : '—'}
          icon={IconCoin}
          tone="brand"
          hint="last 24 hours"
        />
        <MetricCard
          label={t('dashboard.ordersToday')}
          value={metrics.data?.ordersToday ?? '—'}
          icon={IconShoppingBag}
          tone="violet"
        />
        <MetricCard label={t('dashboard.liveChats')} value={metrics.data?.liveChats ?? '—'} icon={IconMessage2} tone="teal" />
        <MetricCard label={t('dashboard.handoffs')} value={metrics.data?.handoffs ?? '—'} icon={IconUrgent} tone="red" />
        <MetricCard
          label={t('dashboard.agentSpend')}
          value={metrics.data ? compact(metrics.data.tokens) : '—'}
          icon={IconCpu}
          tone="cyan"
        />
        <MetricCard
          label={t('dashboard.conversion')}
          value={metrics.data ? `${metrics.data.conversion}%` : '—'}
          icon={IconTrendingUp}
          tone="green"
        />
      </SimpleGrid>

      <div className="collapse-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 16, alignItems: 'start' }}>
        <Surface>
          <SurfaceHeader
            title={t('dashboard.liveConversations')}
            count={chats.data?.length}
            right={
              <Text component={Link} to="/conversations" fz={11} fw={600} c="dimmed" style={{ textDecoration: 'none' }}>
                {t('common.viewAll')}
              </Text>
            }
          />
          {chats.isLoading && <Loading />}
          {chats.data?.length === 0 && <EmptyState />}
          {chats.data?.map((conversation) => (
            <ListRow key={conversation.id} onClick={() => navigate(`/conversations/${conversation.id}`)}>
              <Group justify="space-between" wrap="nowrap" gap="sm">
                <Stack gap={2} style={{ minWidth: 0 }}>
                  <Text fz="sm" fw={600} truncate>
                    {conversation.waProfileName}
                  </Text>
                  <Text fz={11} c="dimmed">
                    {dayjs(conversation.lastInboundAt).format('DD MMM, HH:mm')}
                  </Text>
                </Stack>
                <StatusBadge value={conversation.status} />
              </Group>
            </ListRow>
          ))}
        </Surface>

        <Surface>
          <SurfaceHeader
            title={t('dashboard.recentOrders')}
            count={orders.data?.length}
            right={
              <Text component={Link} to="/orders" fz={11} fw={600} c="dimmed" style={{ textDecoration: 'none' }}>
                {t('common.viewAll')}
              </Text>
            }
          />
          {orders.isLoading && <Loading />}
          {orders.data?.length === 0 && <EmptyState />}
          {orders.data?.map((order) => (
            <ListRow key={order.id} onClick={() => navigate(`/orders/${order.id}`)}>
              <Group justify="space-between" wrap="nowrap" gap="md">
                <Group gap="md" wrap="nowrap" style={{ minWidth: 0 }}>
                  <Stack gap={2} style={{ minWidth: 0 }}>
                    <Text fz="sm" fw={600}>
                      {order.orderNumber}
                    </Text>
                    <Text fz={11} c="dimmed" truncate>
                      {order.customerName} · {order.items.length} {t('orders.items').toLowerCase()}
                    </Text>
                  </Stack>
                </Group>
                <Group gap="sm" wrap="nowrap">
                  <StatusBadge value={order.source} />
                  <StatusBadge value={order.status} />
                  <Text fz="sm" fw={600} w={92} ta="right">
                    {money(order.totalAmount)}
                  </Text>
                  <IconArrowUpRight size={15} stroke={1.8} style={{ opacity: 0.4 }} />
                </Group>
              </Group>
            </ListRow>
          ))}
        </Surface>
      </div>
    </>
  );
}
