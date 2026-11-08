import { Box, Button, Divider, Group, Stack, Table, Tabs, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconArrowLeft, IconTruck } from '@tabler/icons-react';
import dayjs from 'dayjs';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { useConversation, useOrder } from '../api/hooks';
import { money } from '../api/mock';
import { EmptyState, ListRow, Loading, PageHeader, StatTile, StatusBadge, Surface, SurfaceHeader } from '../components/ui';

export default function OrderDetail() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const order = useOrder(id);
  const conversation = useConversation(order.data?.conversationId ?? undefined);

  if (order.isLoading) return <Loading py={80} />;
  if (!order.data) return <EmptyState label={t('common.empty')} />;

  const data = order.data;

  return (
    <>
      <PageHeader
        kicker={`${t('orders.detailKicker')} · ${t(`status.${data.source}`)}`}
        title={data.orderNumber}
        description={`${data.customerName} · ${data.customerPhone} · ${dayjs(data.createdAt).format('DD MMM YYYY, HH:mm')}`}
        actions={
          <>
            <Button variant="default" leftSection={<IconArrowLeft size={16} stroke={1.8} />} onClick={() => navigate('/orders')}>
              {t('common.back')}
            </Button>
            <Button
              leftSection={<IconTruck size={16} stroke={1.8} />}
              onClick={() =>
                notifications.show({
                  title: t('orders.markShipped'),
                  message: data.orderNumber,
                  color: 'teal',
                  radius: 'xl',
                })
              }
            >
              {t('orders.markShipped')}
            </Button>
          </>
        }
      />

      <div className="collapse-grid" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16, alignItems: 'start' }}>
        <Surface>
          <Tabs defaultValue="items" radius="xl" keepMounted={false}>
            <Box px="xl" pt="md" className="surface-header">
              <Group justify="space-between" wrap="nowrap">
                <Tabs.List style={{ border: 0 }}>
                  <Tabs.Tab value="items">{t('orders.tabItems')}</Tabs.Tab>
                  <Tabs.Tab value="payments">{t('orders.tabPayments')}</Tabs.Tab>
                  <Tabs.Tab value="timeline">{t('orders.tabTimeline')}</Tabs.Tab>
                  <Tabs.Tab value="chat">{t('orders.tabChat')}</Tabs.Tab>
                </Tabs.List>
                <StatusBadge value={data.status} />
              </Group>
            </Box>

            <Tabs.Panel value="items">
              <Table className="ss-table" horizontalSpacing="xl" verticalSpacing="sm">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>{t('orders.product')}</Table.Th>
                    <Table.Th>{t('orders.qty')}</Table.Th>
                    <Table.Th ta="right">{t('orders.unit')}</Table.Th>
                    <Table.Th ta="right">{t('orders.lineTotal')}</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {data.items.map((item) => (
                    <Table.Tr key={item.id} style={{ cursor: 'default' }}>
                      <Table.Td>
                        <Text fz="sm" fw={500}>
                          {item.productName}
                        </Text>
                        {item.customizationId && (
                          <Text fz={11} c="dimmed">
                            artwork {item.customizationId}
                          </Text>
                        )}
                      </Table.Td>
                      <Table.Td>{item.quantity}</Table.Td>
                      <Table.Td ta="right">{money(item.unitPrice)}</Table.Td>
                      <Table.Td ta="right">
                        <Text fz="sm" fw={600}>
                          {money(item.lineTotal)}
                        </Text>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Tabs.Panel>

            <Tabs.Panel value="payments">
              <Table className="ss-table" horizontalSpacing="xl" verticalSpacing="sm">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>{t('orders.method')}</Table.Th>
                    <Table.Th>{t('common.status')}</Table.Th>
                    <Table.Th>{t('orders.reference')}</Table.Th>
                    <Table.Th ta="right">{t('orders.amount')}</Table.Th>
                    <Table.Th>{t('orders.when')}</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {data.payments.map((payment) => (
                    <Table.Tr key={payment.id} style={{ cursor: 'default' }}>
                      <Table.Td>{t(`status.${payment.method}`)}</Table.Td>
                      <Table.Td>
                        <StatusBadge value={payment.status} />
                      </Table.Td>
                      <Table.Td>
                        <Text fz="sm" c="dimmed">
                          {payment.transactionRef ?? '—'}
                        </Text>
                      </Table.Td>
                      <Table.Td ta="right">{money(payment.amount)}</Table.Td>
                      <Table.Td>
                        <Text fz="sm" c="dimmed">
                          {payment.paidAt ? dayjs(payment.paidAt).format('DD MMM, HH:mm') : '—'}
                        </Text>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Tabs.Panel>

            <Tabs.Panel value="timeline">
              {data.timeline.map((event) => (
                <ListRow key={event.id}>
                  <Group justify="space-between" align="flex-start" wrap="nowrap" gap="md">
                    <Stack gap={2} style={{ minWidth: 0 }}>
                      <Text fz="sm" fw={600}>
                        {event.label}
                      </Text>
                      <Text fz={11} c="dimmed">
                        {event.detail}
                      </Text>
                    </Stack>
                    <Text fz={11} c="dimmed" style={{ whiteSpace: 'nowrap' }}>
                      {dayjs(event.at).format('DD MMM, HH:mm')}
                    </Text>
                  </Group>
                </ListRow>
              ))}
            </Tabs.Panel>

            <Tabs.Panel value="chat">
              {!data.conversationId ? (
                <EmptyState label={t('orders.noChat')} />
              ) : conversation.isLoading ? (
                <Loading />
              ) : (
                <Stack gap="sm" p="xl">
                  {conversation.data?.messages.map((message) => (
                    <Box
                      key={message.id}
                      className={`bubble ${message.direction === 'OUTBOUND' ? 'bubble--out' : ''}`}
                    >
                      {message.role === 'TOOL' && (
                        <Text fz={10} fw={700} tt="uppercase" style={{ letterSpacing: '0.08em', opacity: 0.7 }}>
                          {message.toolName}
                        </Text>
                      )}
                      {message.content}
                    </Box>
                  ))}
                </Stack>
              )}
            </Tabs.Panel>
          </Tabs>
        </Surface>

        <Stack gap="md">
          <Surface>
            <SurfaceHeader title={t('orders.grandTotal')} />
            <Stack gap="sm" px="xl" py="lg">
              <StatTile label={t('orders.grandTotal')} value={money(data.totalAmount)} />
              <Divider color="var(--ss-border)" />
              <Group justify="space-between">
                <Text fz="sm" c="dimmed">
                  {t('orders.subtotal')}
                </Text>
                <Text fz="sm">{money(data.subtotal)}</Text>
              </Group>
              <Group justify="space-between">
                <Text fz="sm" c="dimmed">
                  {t('orders.shipping')}
                </Text>
                <Text fz="sm">{data.shippingFee === 0 ? 'Free' : money(data.shippingFee)}</Text>
              </Group>
              <Group justify="space-between">
                <Text fz="sm" c="dimmed">
                  {t('orders.method')}
                </Text>
                <Text fz="sm">{t(`status.${data.paymentMethod}`)}</Text>
              </Group>
            </Stack>
          </Surface>

          <Surface>
            <SurfaceHeader title={t('orders.shipTo')} />
            <Stack gap={2} px="xl" py="lg">
              <Text fz="sm" fw={600}>
                {data.customerName}
              </Text>
              <Text fz="sm" c="dimmed">
                {data.address.line1}
              </Text>
              <Text fz="sm" c="dimmed">
                {data.address.city}, {data.address.state} {data.address.pincode}
              </Text>
              <Text fz="sm" c="dimmed">
                {data.customerPhone}
              </Text>
            </Stack>
          </Surface>
        </Stack>
      </div>
    </>
  );
}
