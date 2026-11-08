import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  agentSettings as agentSettingsSeed,
  conversations,
  counts,
  customers,
  customizations,
  metrics,
  modelCalls,
  orders,
  payments,
  products,
  team,
  type AgentSettings,
  type Conversation,
  type ConversationStatus,
  type Order,
  type OrderSource,
  type OrderStatus,
  type Payment,
  type PaymentStatus,
  type Product,
} from './mock';

const latency = (ms = 240) => new Promise((resolve) => setTimeout(resolve, ms));

export type Paged<T> = { rows: T[]; total: number; page: number; pageCount: number };

function paginate<T>(rows: T[], page: number, pageSize: number): Paged<T> {
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const safe = Math.min(Math.max(1, page), pageCount);
  return {
    rows: rows.slice((safe - 1) * pageSize, safe * pageSize),
    total: rows.length,
    page: safe,
    pageCount,
  };
}

/* in-memory stores the mutations write to */
let productStore: Product[] = [...products];
let agentStore: AgentSettings = { ...agentSettingsSeed };

/* ------------------------------ dashboard ------------------------------ */

export function useMetrics() {
  return useQuery({
    queryKey: ['metrics'],
    queryFn: async () => {
      await latency(200);
      return metrics();
    },
  });
}

export function useCounts() {
  return useQuery({
    queryKey: ['counts'],
    queryFn: async () => {
      await latency(120);
      return counts();
    },
  });
}

/* ------------------------------ orders ------------------------------ */

export type OrderFilters = {
  page?: number;
  pageSize?: number;
  status?: OrderStatus | 'ALL';
  source?: OrderSource | 'ALL';
  q?: string;
};

export function useOrders(filters: OrderFilters = {}) {
  const { page = 1, pageSize = 8, status = 'ALL', source = 'ALL', q = '' } = filters;
  return useQuery({
    queryKey: ['orders', { page, pageSize, status, source, q }],
    queryFn: async () => {
      await latency();
      const needle = q.trim().toLowerCase();
      const rows = orders.filter((order) => {
        if (status !== 'ALL' && order.status !== status) return false;
        if (source !== 'ALL' && order.source !== source) return false;
        if (!needle) return true;
        return (
          order.orderNumber.toLowerCase().includes(needle) ||
          order.customerName.toLowerCase().includes(needle) ||
          order.customerPhone.includes(needle)
        );
      });
      return paginate(rows, page, pageSize);
    },
  });
}

export function useOrderStatusCounts() {
  return useQuery({
    queryKey: ['orders', 'status-counts'],
    queryFn: async () => {
      await latency(120);
      const base: Record<string, number> = { ALL: orders.length };
      for (const order of orders) base[order.status] = (base[order.status] ?? 0) + 1;
      return base;
    },
  });
}

export function useOrder(id: string | undefined) {
  return useQuery({
    queryKey: ['order', id],
    enabled: Boolean(id),
    queryFn: async (): Promise<Order> => {
      await latency(200);
      const order = orders.find((candidate) => candidate.id === id);
      if (!order) throw new Error('Order not found');
      return order;
    },
  });
}

export function useRecentOrders(limit = 6) {
  return useQuery({
    queryKey: ['orders', 'recent', limit],
    queryFn: async () => {
      await latency(180);
      return orders.slice(0, limit);
    },
  });
}

/* ------------------------------ payments ------------------------------ */

export function usePayments(filters: { page?: number; pageSize?: number; status?: PaymentStatus | 'ALL' } = {}) {
  const { page = 1, pageSize = 10, status = 'ALL' } = filters;
  return useQuery({
    queryKey: ['payments', { page, pageSize, status }],
    queryFn: async (): Promise<Paged<Payment>> => {
      await latency();
      const rows = payments.filter((payment) => status === 'ALL' || payment.status === status);
      return paginate(rows, page, pageSize);
    },
  });
}

export function usePaymentStatusCounts() {
  return useQuery({
    queryKey: ['payments', 'status-counts'],
    queryFn: async () => {
      await latency(110);
      const base: Record<string, number> = { ALL: payments.length };
      for (const payment of payments) base[payment.status] = (base[payment.status] ?? 0) + 1;
      return base;
    },
  });
}

/* ------------------------------ products ------------------------------ */

export type ProductDraft = {
  id?: string;
  title: string;
  category: string;
  basePrice: number;
  minDpi: number;
  description: string;
  isActive: boolean;
};

export function useProducts(q = '') {
  return useQuery({
    queryKey: ['products', q],
    queryFn: async () => {
      await latency();
      const needle = q.trim().toLowerCase();
      return productStore.filter(
        (product) => !needle || product.title.toLowerCase().includes(needle) || product.category.toLowerCase().includes(needle),
      );
    },
  });
}

export function useSaveProduct() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (draft: ProductDraft) => {
      await latency(420);
      if (draft.id) {
        productStore = productStore.map((product) =>
          product.id === draft.id ? { ...product, ...draft, updatedAt: new Date().toISOString() } : product,
        );
        return { created: false, title: draft.title };
      }
      const nextId = productStore.length + 1;
      productStore = [
        {
          id: `prd_${nextId}`,
          publicId: 1000 + nextId,
          orders30d: 0,
          updatedAt: new Date().toISOString(),
          title: draft.title,
          category: draft.category,
          basePrice: draft.basePrice,
          minDpi: draft.minDpi,
          description: draft.description,
          isActive: draft.isActive,
        },
        ...productStore,
      ];
      return { created: true, title: draft.title };
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['products'] });
    },
  });
}

/* ------------------------------ conversations ------------------------------ */

export function useConversations(status: ConversationStatus | 'ALL' = 'ALL') {
  return useQuery({
    queryKey: ['conversations', status],
    queryFn: async () => {
      await latency();
      const rows = conversations.filter((conversation) => status === 'ALL' || conversation.status === status);
      return [...rows].sort((a, b) => (a.lastInboundAt < b.lastInboundAt ? 1 : -1));
    },
  });
}

export function useConversationStageCounts() {
  return useQuery({
    queryKey: ['conversations', 'stage-counts'],
    queryFn: async () => {
      await latency(110);
      const base: Record<string, number> = { ALL: conversations.length };
      for (const conversation of conversations) base[conversation.status] = (base[conversation.status] ?? 0) + 1;
      return base;
    },
  });
}

export function useConversation(id: string | undefined) {
  return useQuery({
    queryKey: ['conversation', id],
    enabled: Boolean(id),
    queryFn: async (): Promise<Conversation> => {
      await latency(200);
      const conversation = conversations.find((candidate) => candidate.id === id);
      if (!conversation) throw new Error('Conversation not found');
      return conversation;
    },
  });
}

export function useHandoffs() {
  return useQuery({
    queryKey: ['conversations', 'handoffs'],
    queryFn: async () => {
      await latency(180);
      return conversations
        .filter((conversation) => conversation.status === 'HUMAN_HANDOFF')
        .sort((a, b) => (a.lastInboundAt > b.lastInboundAt ? 1 : -1));
    },
  });
}

export function useLiveConversations(limit = 6) {
  return useQuery({
    queryKey: ['conversations', 'live', limit],
    queryFn: async () => {
      await latency(180);
      return conversations
        .filter((conversation) => conversation.status !== 'COMPLETED')
        .sort((a, b) => (a.lastInboundAt < b.lastInboundAt ? 1 : -1))
        .slice(0, limit);
    },
  });
}

/* ------------------------------ misc ------------------------------ */

export function useCustomers(q = '') {
  return useQuery({
    queryKey: ['customers', q],
    queryFn: async () => {
      await latency();
      const needle = q.trim().toLowerCase();
      return customers.filter(
        (customer) =>
          !needle ||
          customer.name.toLowerCase().includes(needle) ||
          customer.email.toLowerCase().includes(needle) ||
          customer.phone.includes(needle),
      );
    },
  });
}

export function useCustomizations() {
  return useQuery({
    queryKey: ['customizations'],
    queryFn: async () => {
      await latency();
      return customizations;
    },
  });
}

export function useModelCalls(limit = 24) {
  return useQuery({
    queryKey: ['model-calls', limit],
    queryFn: async () => {
      await latency();
      return modelCalls.slice(0, limit);
    },
  });
}

export function useAgentStats() {
  return useQuery({
    queryKey: ['agent-stats'],
    queryFn: async () => {
      await latency(160);
      const input = modelCalls.reduce((sum, call) => sum + call.inputTokens, 0);
      const output = modelCalls.reduce((sum, call) => sum + call.outputTokens, 0);
      const cached = modelCalls.reduce((sum, call) => sum + call.cachedTokens, 0);
      const toolCalls = modelCalls.reduce((sum, call) => sum + call.toolCalls, 0);
      const latencyMs = Math.round(modelCalls.reduce((sum, call) => sum + call.latencyMs, 0) / modelCalls.length);
      const byStage = new Map<string, number>();
      for (const call of modelCalls) byStage.set(call.stage, (byStage.get(call.stage) ?? 0) + call.totalTokens);
      return {
        calls: modelCalls.length,
        input,
        output,
        cached,
        toolCalls,
        avgLatency: latencyMs,
        byStage: [...byStage.entries()].sort((a, b) => b[1] - a[1]),
      };
    },
  });
}

export function useTeam() {
  return useQuery({
    queryKey: ['team'],
    queryFn: async () => {
      await latency(160);
      return team;
    },
  });
}

export function useAgentSettings() {
  return useQuery({
    queryKey: ['agent-settings'],
    queryFn: async () => {
      await latency(200);
      return agentStore;
    },
  });
}

export function useSaveAgentSettings() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (next: AgentSettings) => {
      await latency(420);
      agentStore = { ...next };
      return agentStore;
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['agent-settings'] });
    },
  });
}
