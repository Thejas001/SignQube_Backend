import { Group, SegmentedControl, Stack, Text } from '@mantine/core';
import { IconMessageCircle } from '@tabler/icons-react';
import dayjs from 'dayjs';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useConversationStageCounts, useConversations } from '../api/hooks';
import type { ConversationStatus } from '../api/mock';
import {
  EmptyState,
  FilterTile,
  ListRow,
  Loading,
  PageHeader,
  StatusBadge,
  Surface,
  SurfaceHeader,
  toneColor,
} from '../components/ui';

const STAGES: ConversationStatus[] = [
  'DISCOVERY',
  'PRODUCT_RECOMMENDATION',
  'PRODUCT_SELECTED',
  'CUSTOMIZATION',
  'PHOTO_REQUIRED',
  'ADDRESS_REQUIRED',
  'ORDER_READY',
  'PAYMENT_PENDING',
  'PAID',
  'COMPLETED',
  'HUMAN_HANDOFF',
];

export default function Conversations() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [stage, setStage] = useState<ConversationStatus | 'ALL'>('ALL');
  const [view, setView] = useState('all');

  const counts = useConversationStageCounts();
  const conversations = useConversations(stage);

  const rows = (conversations.data ?? []).filter((conversation) => {
    if (view === 'unread') return conversation.unread > 0;
    if (view === 'agent') return conversation.status !== 'HUMAN_HANDOFF';
    return true;
  });

  const options = [
    { value: 'ALL', label: t('common.all'), count: counts.data?.ALL, color: 'var(--ss-muted)' },
    ...STAGES.filter((value) => (counts.data?.[value] ?? 0) > 0).map((value) => ({
      value,
      label: t(`status.${value}`),
      count: counts.data?.[value] ?? 0,
      color: toneColor(value),
    })),
  ];

  return (
    <>
      <PageHeader kicker={t('conversations.kicker')} title={t('conversations.title')} description={t('conversations.description')} />

      <Group gap="sm" mb="md" wrap="wrap">
        <FilterTile
          label={t('conversations.stage')}
          value={stage}
          options={options}
          onChange={(next) => setStage(next as ConversationStatus | 'ALL')}
        />
        <SegmentedControl
          radius="xl"
          value={view}
          onChange={setView}
          data={[
            { value: 'all', label: t('common.all') },
            { value: 'unread', label: t('nav.handoffs') },
            { value: 'agent', label: t('nav.whatsapp') },
          ]}
        />
      </Group>

      <Surface>
        <SurfaceHeader title={t('conversations.title')} count={rows.length} />
        {conversations.isLoading && <Loading />}
        {!conversations.isLoading && rows.length === 0 && <EmptyState />}
        {rows.map((conversation) => {
          const last = conversation.messages[conversation.messages.length - 1];
          return (
            <ListRow key={conversation.id} onClick={() => navigate(`/conversations/${conversation.id}`)}>
              <Group justify="space-between" wrap="nowrap" gap="md">
                <Stack gap={3} style={{ minWidth: 0 }}>
                  <Group gap="xs" wrap="nowrap">
                    <Text fz="sm" fw={600}>
                      {conversation.waProfileName}
                    </Text>
                    <Text fz={11} c="dimmed">
                      {conversation.waPhoneNumber}
                    </Text>
                    {conversation.unread > 0 && <span className="dot" style={{ position: 'static' }} />}
                  </Group>
                  <Text fz={12} c="dimmed" lineClamp={1} style={{ maxWidth: 620 }}>
                    {last?.content}
                  </Text>
                </Stack>
                <Group gap="md" wrap="nowrap">
                  <Group gap={4} wrap="nowrap" visibleFrom="sm">
                    <IconMessageCircle size={14} stroke={1.8} style={{ opacity: 0.45 }} />
                    <Text fz={11} c="dimmed">
                      {conversation.messages.length}
                    </Text>
                  </Group>
                  <StatusBadge value={conversation.status} />
                  <Text fz={11} c="dimmed" style={{ whiteSpace: 'nowrap' }}>
                    {dayjs(conversation.lastInboundAt).format('DD MMM, HH:mm')}
                  </Text>
                </Group>
              </Group>
            </ListRow>
          );
        })}
      </Surface>
    </>
  );
}
