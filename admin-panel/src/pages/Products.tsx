import {
  Button,
  Group,
  Modal,
  NumberInput,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Text,
  Textarea,
  TextInput,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { IconPencil, IconPlus, IconSearch } from '@tabler/icons-react';
import dayjs from 'dayjs';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useProducts, useSaveProduct, type ProductDraft } from '../api/hooks';
import { money, type Product } from '../api/mock';
import { EmptyState, ListRow, Loading, PageHeader, StatusBadge, Surface, SurfaceHeader } from '../components/ui';

const CATEGORIES = ['Signage', 'Photo gifts', 'Merch', 'Stickers', 'Large format', 'Awards'];

const EMPTY: ProductDraft = {
  title: '',
  category: 'Signage',
  basePrice: 0,
  minDpi: 300,
  description: '',
  isActive: true,
};

export default function Products() {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<Product | null>(null);
  const [opened, setOpened] = useState(false);

  const products = useProducts(query);
  const save = useSaveProduct();

  const form = useForm<ProductDraft>({
    initialValues: EMPTY,
    validate: {
      title: (value) => (value.trim().length > 1 ? null : t('products.nameRequired')),
      basePrice: (value) => (value > 0 ? null : t('products.priceRequired')),
    },
  });

  const openCreate = () => {
    setEditing(null);
    form.setValues(EMPTY);
    form.resetDirty(EMPTY);
    setOpened(true);
  };

  const openEdit = (product: Product) => {
    setEditing(product);
    const values: ProductDraft = {
      id: product.id,
      title: product.title,
      category: product.category,
      basePrice: product.basePrice,
      minDpi: product.minDpi,
      description: product.description,
      isActive: product.isActive,
    };
    form.setValues(values);
    form.resetDirty(values);
    setOpened(true);
  };

  const submit = form.onSubmit(async (values) => {
    const result = await save.mutateAsync({ ...values, id: editing?.id });
    notifications.show({
      title: result.created ? t('products.created') : t('products.updated'),
      message: result.title,
      color: 'teal',
      radius: 'xl',
    });
    setOpened(false);
  });

  return (
    <>
      <PageHeader
        kicker={t('products.kicker')}
        title={t('products.title')}
        description={t('products.description')}
        actions={
          <Button leftSection={<IconPlus size={16} stroke={2} />} onClick={openCreate}>
            {t('products.new')}
          </Button>
        }
      />

      <Group gap="sm" mb="md">
        <TextInput
          radius="xl"
          placeholder={t('common.search')}
          leftSection={<IconSearch size={15} stroke={1.8} />}
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
          style={{ flex: '0 1 280px' }}
        />
      </Group>

      <Surface>
        <SurfaceHeader title={t('products.title')} count={products.data?.length} />
        {products.isLoading && <Loading />}
        {products.data?.length === 0 && <EmptyState />}
        {products.data?.map((product) => (
          <ListRow key={product.id} onClick={() => openEdit(product)}>
            <Group justify="space-between" wrap="nowrap" gap="md">
              <Stack gap={2} style={{ minWidth: 0 }}>
                <Group gap="xs" wrap="nowrap">
                  <Text fz="sm" fw={600} truncate>
                    {product.title}
                  </Text>
                  <StatusBadge value={product.isActive ? 'ACTIVE' : 'DRAFT'} size="xs" />
                </Group>
                <Text fz={11} c="dimmed" truncate>
                  {product.category} · #{product.publicId} · min {product.minDpi} DPI · {product.orders30d} orders in 30d
                </Text>
              </Stack>
              <Group gap="lg" wrap="nowrap">
                <Text fz={11} c="dimmed" visibleFrom="sm">
                  {dayjs(product.updatedAt).format('DD MMM')}
                </Text>
                <Text fz="sm" fw={600} ta="right" w={86}>
                  {money(product.basePrice)}
                </Text>
                <IconPencil size={15} stroke={1.8} style={{ opacity: 0.4 }} />
              </Group>
            </Group>
          </ListRow>
        ))}
      </Surface>

      <Modal
        opened={opened}
        onClose={() => setOpened(false)}
        title={editing ? t('products.editTitle') : t('products.createTitle')}
        size="lg"
      >
        <form onSubmit={submit}>
          <Stack gap="md">
            <TextInput label={t('products.name')} placeholder="LED Neon Name Sign" {...form.getInputProps('title')} />
            <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
              <Select label={t('products.category')} data={CATEGORIES} {...form.getInputProps('category')} />
              <NumberInput
                label={t('products.basePrice')}
                prefix="₹ "
                thousandSeparator=","
                min={0}
                {...form.getInputProps('basePrice')}
              />
              <NumberInput label={t('products.minDpi')} min={72} max={1200} step={10} {...form.getInputProps('minDpi')} />
            </SimpleGrid>
            <Textarea
              label={t('products.descriptionField')}
              autosize
              minRows={3}
              maxRows={6}
              {...form.getInputProps('description')}
            />
            <Switch label={t('products.active')} {...form.getInputProps('isActive', { type: 'checkbox' })} />
            <Group justify="flex-end" gap="sm" mt="xs">
              <Button variant="subtle" color="gray" onClick={() => setOpened(false)}>
                {t('common.cancel')}
              </Button>
              <Button type="submit" loading={save.isPending}>
                {editing ? t('common.save') : t('common.create')}
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>
    </>
  );
}
