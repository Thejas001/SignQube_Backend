import { Button, Center, Group, Pagination, SegmentedControl, Table, Text, TextInput } from '@mantine/core';
import { IconDownload, IconSearch } from '@tabler/icons-react';
import dayjs from 'dayjs';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useOrderStatusCounts, useOrders } from '../api/hooks';
import { money, type OrderSource, type OrderStatus } from '../api/mock';
import {
  EmptyState,
  FilterTile,
  Loading,
  PageHeader,
  StatusBadge,
  Surface,
  SurfaceHeader,
  toneColor,
} from '../components/ui';

const STATUSES: OrderStatus[] = ['PENDING', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED'];

export default function Orders() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [status, setStatus] = useState<OrderStatus | 'ALL'>('ALL');
  const [source, setSource] = useState<OrderSource | 'ALL'>('ALL');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);

  const counts = useOrderStatusCounts();
  const orders = useOrders({ page, status, source, q: query, pageSize: 8 });

  const options = [
    { value: 'ALL', label: t('common.all'), count: counts.data?.ALL, color: 'var(--ss-muted)' },
    ...STATUSES.map((value) => ({
      value,
      label: t(`status.${value}`),
      count: counts.data?.[value] ?? 0,
      color: toneColor(value),
    })),
  ];

  return (
    <>
      <PageHeader
        kicker={t('orders.kicker')}
        title={t('orders.title')}
        description={t('orders.description')}
        actions={
          <Button variant="default" leftSection={<IconDownload size={16} stroke={1.8} />}>
            {t('common.export')}
          </Button>
        }
      />

      <Group gap="sm" mb="md" wrap="wrap">
        <FilterTile
          label={t('orders.filterStatus')}
          value={status}
          options={options}
          onChange={(next) => {
            setStatus(next as OrderStatus | 'ALL');
            setPage(1);
          }}
        />
        <SegmentedControl
          radius="xl"
          value={source}
          onChange={(next) => {
            setSource(next as OrderSource | 'ALL');
            setPage(1);
          }}
          data={[
            { value: 'ALL', label: t('common.all') },
            { value: 'WHATSAPP', label: t('status.WHATSAPP') },
            { value: 'WEB', label: t('status.WEB') },
          ]}
        />
        <TextInput
          radius="xl"
          placeholder={t('common.search')}
          leftSection={<IconSearch size={15} stroke={1.8} />}
          value={query}
          onChange={(event) => {
            setQuery(event.currentTarget.value);
            setPage(1);
          }}
          style={{ flex: '0 1 240px' }}
        />
      </Group>

      <Surface>
        <SurfaceHeader
          title={t('orders.title')}
          count={orders.data?.total}
          right={
            <Text fz={11} c="dimmed">
              {t('common.results', { count: orders.data?.total ?? 0 })}
            </Text>
          }
        />

        {orders.isLoading ? (
          <Loading />
        ) : orders.data && orders.data.rows.length > 0 ? (
          <Table.ScrollContainer minWidth={760}>
            <Table className="ss-table" verticalSpacing="xs" horizontalSpacing="xl" highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>{t('orders.number')}</Table.Th>
                  <Table.Th>{t('orders.customer')}</Table.Th>
                  <Table.Th>{t('common.source')}</Table.Th>
                  <Table.Th>{t('common.status')}</Table.Th>
                  <Table.Th>{t('orders.items')}</Table.Th>
                  <Table.Th ta="right">{t('orders.total')}</Table.Th>
                  <Table.Th>{t('orders.placed')}</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {orders.data.rows.map((order) => (
                  <Table.Tr key={order.id} onClick={() => navigate(`/orders/${order.id}`)}>
                    <Table.Td>
                      <Text fz="sm" fw={600}>
                        {order.orderNumber}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Text fz="sm">{order.customerName}</Text>
                      <Text fz={11} c="dimmed">
                        {order.customerPhone}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <StatusBadge value={order.source} />
                    </Table.Td>
                    <Table.Td>
                      <StatusBadge value={order.status} />
                    </Table.Td>
                    <Table.Td>{order.items.length}</Table.Td>
                    <Table.Td ta="right">
                      <Text fz="sm" fw={600}>
                        {money(order.totalAmount)}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Text fz="sm" c="dimmed">
                        {dayjs(order.createdAt).format('DD MMM, HH:mm')}
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        ) : (
          <EmptyState />
        )}
      </Surface>

      {orders.data && orders.data.pageCount > 1 && (
        <Center mt="lg">
          <Pagination
            radius="xl"
            withEdges
            value={orders.data.page}
            total={orders.data.pageCount}
            onChange={setPage}
            size="sm"
          />
        </Center>
      )}
    </>
  );
}
