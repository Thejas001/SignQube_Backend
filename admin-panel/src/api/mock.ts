import dayjs from 'dayjs';

/* ------------------------------------------------------------------ *
 * Types mirror prisma/schema.prisma so swapping the mock for the real
 * admin API is a matter of replacing the fetchers in ./hooks.ts.
 * ------------------------------------------------------------------ */

export type OrderStatus = 'PENDING' | 'PROCESSING' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED';
export type OrderSource = 'WEB' | 'WHATSAPP';
export type PaymentMethod = 'UPI' | 'CARD' | 'COD' | 'PAYMENT_LINK';
export type PaymentStatus = 'PENDING' | 'SUCCESS' | 'FAILED' | 'REFUNDED';
export type ConversationStatus =
  | 'DISCOVERY'
  | 'PRODUCT_RECOMMENDATION'
  | 'PRODUCT_SELECTED'
  | 'CUSTOMIZATION'
  | 'PHOTO_REQUIRED'
  | 'ADDRESS_REQUIRED'
  | 'ORDER_READY'
  | 'PAYMENT_PENDING'
  | 'PAID'
  | 'COMPLETED'
  | 'HUMAN_HANDOFF';
export type MessageRole = 'USER' | 'ASSISTANT' | 'SYSTEM' | 'TOOL' | 'ADMIN';
export type MessageDirection = 'INBOUND' | 'OUTBOUND';

export type Product = {
  id: string;
  publicId: number;
  title: string;
  description: string;
  category: string;
  basePrice: number;
  minDpi: number;
  isActive: boolean;
  orders30d: number;
  updatedAt: string;
};

export type Customer = {
  id: string;
  name: string;
  email: string;
  phone: string;
  orderCount: number;
  lifetimeSpend: number;
  createdAt: string;
  source: OrderSource;
};

export type OrderItem = {
  id: string;
  productId: string;
  productName: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
  customizationId: string | null;
};

export type Payment = {
  id: string;
  orderId: string;
  orderNumber: string;
  customerName: string;
  method: PaymentMethod;
  status: PaymentStatus;
  transactionRef: string | null;
  amount: number;
  paidAt: string | null;
  createdAt: string;
};

export type TimelineEvent = { id: string; label: string; detail: string; at: string };

export type Order = {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  source: OrderSource;
  paymentMethod: PaymentMethod;
  customerId: string;
  customerName: string;
  customerPhone: string;
  conversationId: string | null;
  address: { line1: string; city: string; state: string; pincode: string };
  subtotal: number;
  shippingFee: number;
  totalAmount: number;
  items: OrderItem[];
  payments: Payment[];
  timeline: TimelineEvent[];
  createdAt: string;
};

export type Message = {
  id: string;
  role: MessageRole;
  direction: MessageDirection;
  content: string;
  toolName: string | null;
  totalTokens: number | null;
  createdAt: string;
};

export type ModelCall = {
  id: string;
  conversationId: string;
  waPhoneNumber: string;
  round: number;
  stage: ConversationStatus;
  requestType: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cachedTokens: number;
  latencyMs: number;
  toolCalls: number;
  toolNames: string[];
  createdAt: string;
};

export type Conversation = {
  id: string;
  waPhoneNumber: string;
  waProfileName: string;
  customerId: string | null;
  status: ConversationStatus;
  handoffReason: string | null;
  lastInboundAt: string;
  lastOutboundAt: string;
  unread: number;
  messages: Message[];
  draftOrder: {
    productName: string;
    quantity: number;
    unitPrice: number;
    addons: string[];
    artworkUrl: string | null;
    notes: string;
  } | null;
  createdAt: string;
};

export type Customization = {
  id: string;
  customerName: string;
  productName: string;
  uploadedImageUrl: string;
  widthPx: number;
  heightPx: number;
  dpi: number;
  check: 'PASSED' | 'FLAGGED' | 'REJECTED';
  createdAt: string;
};

export type TeamMember = {
  id: string;
  name: string;
  email: string;
  role: 'Owner' | 'Admin' | 'Support' | 'Fulfilment';
  lastSeen: string;
};

export type AgentSettings = {
  businessName: string;
  tone: string;
  welcomeMessage: string;
  deliveryInfo: string;
  returnPolicy: string;
  systemPromptExtra: string;
};

/* ------------------------------ helpers ------------------------------ */

function rng(seed: number) {
  let s = seed;
  return () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = rng(20261108);
const pick = <T,>(items: readonly T[]): T => items[Math.floor(rand() * items.length)]!;
const between = (min: number, max: number) => Math.floor(rand() * (max - min + 1)) + min;
const hoursAgo = (h: number) => dayjs().subtract(h, 'hour').toISOString();

export const money = (value: number, locale = 'en-IN') =>
  new Intl.NumberFormat(locale, { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value);

export const compact = (value: number) => new Intl.NumberFormat('en-US', { notation: 'compact' }).format(value);

/* ------------------------------ products ------------------------------ */

const PRODUCT_SEED: Array<[string, string, number, string, number]> = [
  ['LED Neon Name Sign', 'Signage', 4200, 'Bendable LED neon on clear acrylic backing, any name up to 12 characters.', 300],
  ['Backlit Shop Signboard', 'Signage', 11500, 'Weatherproof ACP frame with edge-lit LED module and printed vinyl face.', 300],
  ['Brushed Metal Door Plate', 'Signage', 1450, 'Laser-etched stainless plate with adhesive mount, 200x60mm.', 600],
  ['Desk Name Plate', 'Signage', 890, 'Solid wood base with engraved acrylic insert for desks and counters.', 300],
  ['Acrylic Photo Block', 'Photo gifts', 1250, 'Direct UV print on 20mm acrylic, polished edges, free-standing.', 300],
  ['Canvas Print 12x18', 'Photo gifts', 1650, 'Gallery-wrapped cotton canvas on pine stretcher bars.', 200],
  ['Photo Keychain Pack', 'Photo gifts', 420, 'Set of four double-sided acrylic keychains with your photos.', 300],
  ['Custom Mug 11oz', 'Merch', 380, 'Ceramic mug, dishwasher-safe sublimation print, full wrap.', 200],
  ['Custom Mouse Pad', 'Merch', 540, 'Stitched-edge cloth top with natural rubber base, 900x400mm.', 150],
  ['Custom Phone Case', 'Merch', 690, 'Impact-resistant polycarbonate shell, printed edge to edge.', 300],
  ['Vinyl Car Decal', 'Stickers', 320, 'Weatherproof cut vinyl, transfer tape applied, up to 300mm wide.', 300],
  ['Reflective Number Plate', 'Signage', 1180, 'IND-standard retro-reflective sheet on aluminium with hot stamping.', 600],
  ['Fabric Banner 3x6 ft', 'Large format', 2250, 'Dye-sublimated polyester with stitched hem and brass eyelets.', 120],
  ['Foam Board Poster', 'Large format', 760, '5mm foam core board, matte laminated print, A2 to A0.', 150],
  ['Engraved Wooden Plaque', 'Awards', 1950, 'Sheesham plaque with deep laser engraving and wall mount.', 300],
  ['Glass Award Trophy', 'Awards', 2750, 'Optical crystal with sandblasted artwork and velvet box.', 300],
];

export const products: Product[] = PRODUCT_SEED.map(([title, category, basePrice, description, minDpi], i) => ({
  id: `prd_${i + 1}`,
  publicId: 1001 + i,
  title,
  category,
  basePrice,
  description,
  minDpi,
  isActive: i !== 11 && i !== 13,
  orders30d: between(4, 180),
  updatedAt: hoursAgo(between(2, 600)),
}));

/* ------------------------------ customers ------------------------------ */

const CUSTOMER_SEED: Array<[string, string]> = [
  ['Aarav Mehta', 'aarav.mehta'],
  ['Divya Raghavan', 'divya.r'],
  ['Imran Sheikh', 'imran.sheikh'],
  ['Kavya Nair', 'kavya.nair'],
  ['Rohit Bansal', 'rohit.bansal'],
  ['Sneha Kulkarni', 'sneha.k'],
  ['Vikram Chauhan', 'vikram.c'],
  ['Priya Deshpande', 'priya.d'],
  ['Ananya Iyer', 'ananya.iyer'],
  ['Farhan Qureshi', 'farhan.q'],
  ['Meera Pillai', 'meera.pillai'],
  ['Siddharth Rao', 'sid.rao'],
  ['Tanvi Joshi', 'tanvi.joshi'],
  ['Yusuf Khan', 'yusuf.khan'],
  ['Neha Gupta', 'neha.gupta'],
  ['Arjun Patel', 'arjun.patel'],
];

export const customers: Customer[] = CUSTOMER_SEED.map(([name, handle], i) => ({
  id: `usr_${i + 1}`,
  name,
  email: `${handle}@example.com`,
  phone: `+91 9${between(10, 99)}${between(1000000, 9999999)}`,
  orderCount: between(1, 14),
  lifetimeSpend: between(1200, 86000),
  createdAt: hoursAgo(between(72, 9000)),
  source: i % 3 === 0 ? 'WHATSAPP' : 'WEB',
}));

/* ------------------------------ addresses ------------------------------ */

const CITIES: Array<[string, string, string]> = [
  ['Bengaluru', 'Karnataka', '560034'],
  ['Pune', 'Maharashtra', '411004'],
  ['Mumbai', 'Maharashtra', '400053'],
  ['Hyderabad', 'Telangana', '500081'],
  ['Kochi', 'Kerala', '682016'],
  ['Jaipur', 'Rajasthan', '302020'],
  ['Delhi', 'Delhi', '110024'],
  ['Ahmedabad', 'Gujarat', '380015'],
];

const STREETS = ['12 Lakeview Residency', '7B Sunrise Apartments', '44 Palm Grove', '201 Orchid Towers', '9 Mango Lane', '88 Riverside Walk'];

/* ------------------------------ orders ------------------------------ */

const ORDER_STATUSES: OrderStatus[] = ['PENDING', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED'];
const STATUS_WEIGHTS: OrderStatus[] = [
  'PENDING',
  'PENDING',
  'PENDING',
  'PROCESSING',
  'PROCESSING',
  'PROCESSING',
  'PROCESSING',
  'SHIPPED',
  'SHIPPED',
  'SHIPPED',
  'DELIVERED',
  'DELIVERED',
  'DELIVERED',
  'DELIVERED',
  'DELIVERED',
  'CANCELLED',
];

function paymentFor(order: Omit<Order, 'payments' | 'timeline'>, index: number): Payment[] {
  const method = order.paymentMethod;
  const base = {
    orderId: order.id,
    orderNumber: order.orderNumber,
    customerName: order.customerName,
    method,
    amount: order.totalAmount,
    createdAt: order.createdAt,
  };

  if (method === 'COD') {
    return [
      {
        ...base,
        id: `pay_${index}_1`,
        status: order.status === 'DELIVERED' ? 'SUCCESS' : 'PENDING',
        transactionRef: null,
        paidAt: order.status === 'DELIVERED' ? dayjs(order.createdAt).add(between(24, 96), 'hour').toISOString() : null,
      },
    ];
  }

  if (order.status === 'CANCELLED') {
    return [
      {
        ...base,
        id: `pay_${index}_1`,
        status: 'REFUNDED',
        transactionRef: `rzp_${between(100000, 999999)}`,
        paidAt: dayjs(order.createdAt).add(1, 'hour').toISOString(),
      },
    ];
  }

  if (order.status === 'PENDING') {
    const failed = index % 7 === 0;
    return [
      {
        ...base,
        id: `pay_${index}_1`,
        status: failed ? 'FAILED' : 'PENDING',
        transactionRef: failed ? `rzp_${between(100000, 999999)}` : null,
        paidAt: null,
      },
    ];
  }

  return [
    {
      ...base,
      id: `pay_${index}_1`,
      status: 'SUCCESS',
      transactionRef: `rzp_${between(100000, 999999)}`,
      paidAt: dayjs(order.createdAt).add(between(1, 20), 'minute').toISOString(),
    },
  ];
}

function timelineFor(order: Omit<Order, 'timeline'>): TimelineEvent[] {
  const events: TimelineEvent[] = [
    {
      id: `${order.id}_t1`,
      label: order.source === 'WHATSAPP' ? 'Order drafted by agent' : 'Order placed on web',
      detail: order.source === 'WHATSAPP' ? `Agent closed the chat with ${order.customerPhone}` : 'Checkout completed in browser',
      at: order.createdAt,
    },
  ];
  const paid = order.payments.find((payment) => payment.status === 'SUCCESS');
  if (paid?.paidAt) {
    events.push({
      id: `${order.id}_t2`,
      label: 'Payment captured',
      detail: `${paid.method} · ${paid.transactionRef ?? 'collected on delivery'}`,
      at: paid.paidAt,
    });
  }
  if (['PROCESSING', 'SHIPPED', 'DELIVERED'].includes(order.status)) {
    events.push({
      id: `${order.id}_t3`,
      label: 'Sent to production',
      detail: 'Artwork approved, queued on the UV printer',
      at: dayjs(order.createdAt).add(between(2, 10), 'hour').toISOString(),
    });
  }
  if (['SHIPPED', 'DELIVERED'].includes(order.status)) {
    events.push({
      id: `${order.id}_t4`,
      label: 'Handed to courier',
      detail: `Delhivery · AWB ${between(100000000, 999999999)}`,
      at: dayjs(order.createdAt).add(between(12, 40), 'hour').toISOString(),
    });
  }
  if (order.status === 'DELIVERED') {
    events.push({
      id: `${order.id}_t5`,
      label: 'Delivered',
      detail: `Signed for at ${order.address.city}`,
      at: dayjs(order.createdAt).add(between(44, 96), 'hour').toISOString(),
    });
  }
  if (order.status === 'CANCELLED') {
    events.push({
      id: `${order.id}_t6`,
      label: 'Cancelled and refunded',
      detail: 'Customer asked for a different size',
      at: dayjs(order.createdAt).add(between(3, 20), 'hour').toISOString(),
    });
  }
  return events.reverse();
}

export const orders: Order[] = Array.from({ length: 48 }, (_, i) => {
  const customer = customers[i % customers.length]!;
  const status = STATUS_WEIGHTS[i % STATUS_WEIGHTS.length]!;
  const source: OrderSource = i % 5 === 0 || i % 7 === 0 ? 'WEB' : 'WHATSAPP';
  const method: PaymentMethod = source === 'WHATSAPP' ? pick(['PAYMENT_LINK', 'UPI', 'COD'] as const) : pick(['UPI', 'CARD', 'COD'] as const);
  const lineCount = between(1, 3);
  const items: OrderItem[] = Array.from({ length: lineCount }, (_, j) => {
    const product = products[(i * 3 + j) % products.length]!;
    const quantity = between(1, 4);
    return {
      id: `itm_${i}_${j}`,
      productId: product.id,
      productName: product.title,
      unitPrice: product.basePrice,
      quantity,
      lineTotal: product.basePrice * quantity,
      customizationId: j === 0 ? `cus_${i}` : null,
    };
  });
  const subtotal = items.reduce((sum, item) => sum + item.lineTotal, 0);
  const shippingFee = subtotal > 5000 ? 0 : 99;
  const [city, state, pincode] = CITIES[i % CITIES.length]!;

  const shallow = {
    id: `ord_${i + 1}`,
    orderNumber: `SQ-${10401 + i}`,
    status,
    source,
    paymentMethod: method,
    customerId: customer.id,
    customerName: customer.name,
    customerPhone: customer.phone,
    conversationId: source === 'WHATSAPP' ? `cnv_${(i % 16) + 1}` : null,
    address: { line1: STREETS[i % STREETS.length]!, city, state, pincode },
    subtotal,
    shippingFee,
    totalAmount: subtotal + shippingFee,
    items,
    createdAt: hoursAgo(i * 5 + between(1, 4)),
  };

  const payments = paymentFor(shallow, i + 1);
  const withPayments = { ...shallow, payments };
  return { ...withPayments, timeline: timelineFor(withPayments) };
});

export const payments: Payment[] = orders.flatMap((order) => order.payments);

/* ------------------------------ conversations ------------------------------ */

const STAGE_FLOW: ConversationStatus[] = [
  'HUMAN_HANDOFF',
  'PAYMENT_PENDING',
  'CUSTOMIZATION',
  'PHOTO_REQUIRED',
  'ORDER_READY',
  'DISCOVERY',
  'HUMAN_HANDOFF',
  'PAID',
  'ADDRESS_REQUIRED',
  'PRODUCT_RECOMMENDATION',
  'COMPLETED',
  'PRODUCT_SELECTED',
  'HUMAN_HANDOFF',
  'COMPLETED',
  'DISCOVERY',
  'PAYMENT_PENDING',
];

const HANDOFF_REASONS = [
  'Customer asked for a bulk discount the agent cannot approve',
  'Artwork rejected three times, customer frustrated',
  'Asked about GST invoice for a company purchase',
];

function transcript(stage: ConversationStatus, name: string, product: string, startHours: number): Message[] {
  const t = (offset: number) => hoursAgo(startHours - offset);
  const out: Message[] = [
    { id: 'm1', role: 'USER', direction: 'INBOUND', content: 'Hi, do you make custom signs?', toolName: null, totalTokens: null, createdAt: t(0) },
    {
      id: 'm2',
      role: 'ASSISTANT',
      direction: 'OUTBOUND',
      content: `Hi ${name}! Yes, we print and fabricate signage, photo gifts and merch. What are you looking for?`,
      toolName: null,
      totalTokens: 412,
      createdAt: t(0.05),
    },
    {
      id: 'm3',
      role: 'USER',
      direction: 'INBOUND',
      content: 'Something for my shop entrance, lit up if possible',
      toolName: null,
      totalTokens: null,
      createdAt: t(0.1),
    },
    {
      id: 'm4',
      role: 'TOOL',
      direction: 'OUTBOUND',
      content: `search_products(query="lit signage for shop entrance") -> 3 matches`,
      toolName: 'search_products',
      totalTokens: 188,
      createdAt: t(0.12),
    },
    {
      id: 'm5',
      role: 'ASSISTANT',
      direction: 'OUTBOUND',
      content: `The ${product} is our most popular pick for shopfronts. It is weatherproof and we can match your brand colours.`,
      toolName: null,
      totalTokens: 604,
      createdAt: t(0.14),
    },
  ];

  if (stage === 'DISCOVERY') return out.slice(0, 3);
  if (stage === 'PRODUCT_RECOMMENDATION') return out;

  out.push({
    id: 'm6',
    role: 'USER',
    direction: 'INBOUND',
    content: 'That looks good. I want my shop name on it.',
    toolName: null,
    totalTokens: null,
    createdAt: t(0.3),
  });

  if (stage === 'PHOTO_REQUIRED') {
    out.push({
      id: 'm7',
      role: 'ASSISTANT',
      direction: 'OUTBOUND',
      content: 'Could you send your logo as an image? For a clean print we need at least 300 DPI.',
      toolName: null,
      totalTokens: 377,
      createdAt: t(0.33),
    });
    return out;
  }

  out.push({
    id: 'm7',
    role: 'USER',
    direction: 'INBOUND',
    content: '[image] logo-final.png',
    toolName: null,
    totalTokens: null,
    createdAt: t(0.33),
  });
  out.push({
    id: 'm8',
    role: 'TOOL',
    direction: 'OUTBOUND',
    content: 'check_artwork(media_id="wamid.HBg…") -> { dpi: 412, width: 2400, verdict: "PASSED" }',
    toolName: 'check_artwork',
    totalTokens: 206,
    createdAt: t(0.35),
  });

  if (stage === 'CUSTOMIZATION') {
    out.push({
      id: 'm9',
      role: 'ASSISTANT',
      direction: 'OUTBOUND',
      content: 'Artwork looks sharp. Do you want warm white or cool white lighting?',
      toolName: null,
      totalTokens: 441,
      createdAt: t(0.37),
    });
    return out;
  }

  if (stage === 'ADDRESS_REQUIRED') {
    out.push({
      id: 'm9',
      role: 'ASSISTANT',
      direction: 'OUTBOUND',
      content: 'Great. Share the delivery address with pincode and I will confirm the total.',
      toolName: null,
      totalTokens: 390,
      createdAt: t(0.4),
    });
    return out;
  }

  out.push({
    id: 'm9',
    role: 'ASSISTANT',
    direction: 'OUTBOUND',
    content: `All set: 1 x ${product}, delivered in 5 to 7 working days. Shall I create the order?`,
    toolName: null,
    totalTokens: 512,
    createdAt: t(0.4),
  });

  if (stage === 'ORDER_READY' || stage === 'PRODUCT_SELECTED') return out;

  out.push({
    id: 'm10',
    role: 'TOOL',
    direction: 'OUTBOUND',
    content: 'create_payment_link(amount=11599) -> https://rzp.io/l/sq-9f21c',
    toolName: 'create_payment_link',
    totalTokens: 231,
    createdAt: t(0.45),
  });
  out.push({
    id: 'm11',
    role: 'ASSISTANT',
    direction: 'OUTBOUND',
    content: 'Here is your secure payment link. It stays valid for 24 hours.',
    toolName: null,
    totalTokens: 298,
    createdAt: t(0.46),
  });

  if (stage === 'PAYMENT_PENDING') return out;

  if (stage === 'HUMAN_HANDOFF') {
    out.push({
      id: 'm12',
      role: 'USER',
      direction: 'INBOUND',
      content: 'Can you do 20 pieces at a lower rate? And I need a GST invoice.',
      toolName: null,
      totalTokens: null,
      createdAt: t(0.5),
    });
    out.push({
      id: 'm13',
      role: 'ASSISTANT',
      direction: 'OUTBOUND',
      content: 'That needs a human from our team. I have passed this on and someone will reply shortly.',
      toolName: null,
      totalTokens: 263,
      createdAt: t(0.52),
    });
    return out;
  }

  out.push({
    id: 'm12',
    role: 'USER',
    direction: 'INBOUND',
    content: 'Paid just now',
    toolName: null,
    totalTokens: null,
    createdAt: t(0.55),
  });
  out.push({
    id: 'm13',
    role: 'ASSISTANT',
    direction: 'OUTBOUND',
    content: 'Payment received, thank you. Your order is confirmed and goes into production today.',
    toolName: null,
    totalTokens: 284,
    createdAt: t(0.56),
  });

  if (stage === 'COMPLETED') {
    out.push({
      id: 'm14',
      role: 'ADMIN',
      direction: 'OUTBOUND',
      content: 'Shipped today via Delhivery, tracking sent on SMS.',
      toolName: null,
      totalTokens: null,
      createdAt: t(0.9),
    });
  }
  return out;
}

export const conversations: Conversation[] = STAGE_FLOW.map((status, i) => {
  const customer = customers[(i + 2) % customers.length]!;
  const product = products[(i * 2) % products.length]!;
  const startHours = i * 3 + between(1, 3);
  const messages = transcript(status, customer.name.split(' ')[0]!, product.title, startHours);
  const last = messages[messages.length - 1]!;
  const inbound = [...messages].reverse().find((message) => message.direction === 'INBOUND') ?? last;
  const hasDraft = !['DISCOVERY', 'PRODUCT_RECOMMENDATION'].includes(status);

  return {
    id: `cnv_${i + 1}`,
    waPhoneNumber: customer.phone,
    waProfileName: customer.name,
    customerId: i % 4 === 0 ? null : customer.id,
    status,
    handoffReason: status === 'HUMAN_HANDOFF' ? HANDOFF_REASONS[i % HANDOFF_REASONS.length]! : null,
    lastInboundAt: inbound.createdAt,
    lastOutboundAt: last.createdAt,
    unread: status === 'HUMAN_HANDOFF' ? between(1, 4) : 0,
    messages,
    draftOrder: hasDraft
      ? {
          productName: product.title,
          quantity: between(1, 20),
          unitPrice: product.basePrice,
          addons: pick([['Warm white LED'], ['Cool white LED', 'Dimmer'], ['Matte lamination'], []] as const).slice(),
          artworkUrl: status === 'PHOTO_REQUIRED' ? null : 'uploads/logo-final.png',
          notes: 'Brand colours: #0f79db and #002e5d. Mount with adhesive, no drilling.',
        }
      : null,
    createdAt: hoursAgo(startHours),
  };
});

/* ------------------------------ model calls ------------------------------ */

const MODELS = ['gpt-4.1-mini', 'gpt-4.1', 'gpt-4o-mini'];
const REQUEST_TYPES = ['chat', 'tool_followup', 'embedding', 'summary'];
const TOOL_NAMES = [
  ['search_products'],
  ['check_artwork'],
  ['create_payment_link'],
  ['search_products', 'get_pricing'],
  [],
];

export const modelCalls: ModelCall[] = Array.from({ length: 60 }, (_, i) => {
  const conversation = conversations[i % conversations.length]!;
  const inputTokens = between(900, 5400);
  const outputTokens = between(60, 720);
  const tools = TOOL_NAMES[i % TOOL_NAMES.length]!;
  return {
    id: `mc_${i + 1}`,
    conversationId: conversation.id,
    waPhoneNumber: conversation.waPhoneNumber,
    round: (i % 4) + 1,
    stage: conversation.status,
    requestType: REQUEST_TYPES[i % REQUEST_TYPES.length]!,
    model: MODELS[i % MODELS.length]!,
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    cachedTokens: i % 3 === 0 ? between(400, 2600) : 0,
    latencyMs: between(420, 4200),
    toolCalls: tools.length,
    toolNames: tools,
    createdAt: hoursAgo(i * 1.5 + 1),
  };
});

/* ------------------------------ customizations ------------------------------ */

export const customizations: Customization[] = Array.from({ length: 22 }, (_, i) => {
  const customer = customers[(i + 5) % customers.length]!;
  const product = products[(i + 3) % products.length]!;
  const dpi = pick([96, 150, 220, 300, 412, 600] as const);
  return {
    id: `cus_${i}`,
    customerName: customer.name,
    productName: product.title,
    uploadedImageUrl: `uploads/artwork-${1200 + i}.png`,
    widthPx: between(900, 4200),
    heightPx: between(900, 4200),
    dpi,
    check: dpi >= 300 ? 'PASSED' : dpi >= 150 ? 'FLAGGED' : 'REJECTED',
    createdAt: hoursAgo(i * 6 + 2),
  };
});

/* ------------------------------ team + agent ------------------------------ */

export const team: TeamMember[] = [
  { id: 'tm_1', name: 'Thejas Velgi', email: 'thejas@signque.in', role: 'Owner', lastSeen: hoursAgo(0.2) },
  { id: 'tm_2', name: 'Ritu Shetty', email: 'ritu@signque.in', role: 'Admin', lastSeen: hoursAgo(3) },
  { id: 'tm_3', name: 'Mohit Verma', email: 'mohit@signque.in', role: 'Support', lastSeen: hoursAgo(26) },
  { id: 'tm_4', name: 'Sahana Bhat', email: 'sahana@signque.in', role: 'Fulfilment', lastSeen: hoursAgo(9) },
];

export const agentSettings: AgentSettings = {
  businessName: 'SIGNQUE',
  tone: 'Friendly and helpful',
  welcomeMessage: 'Hi, how can I help you?',
  deliveryInfo: 'Printed in 2 working days. Delivery across India in 5 to 7 working days, free above Rs 5,000.',
  returnPolicy: 'Custom items are not returnable unless the print is defective. Report defects within 48 hours with a photo.',
  systemPromptExtra:
    'Never promise same-day delivery. Always ask for artwork at 300 DPI or higher before drafting an order. Escalate bulk pricing and GST invoice questions to a human.',
};

/* ------------------------------ derived metrics ------------------------------ */

export function metrics() {
  const todayOrders = orders.filter((order) => dayjs(order.createdAt).isAfter(dayjs().subtract(24, 'hour')));
  const revenue = todayOrders
    .filter((order) => order.status !== 'CANCELLED')
    .reduce((sum, order) => sum + order.totalAmount, 0);
  const live = conversations.filter((conversation) => !['COMPLETED'].includes(conversation.status));
  const handoff = conversations.filter((conversation) => conversation.status === 'HUMAN_HANDOFF');
  const tokens = modelCalls.reduce((sum, call) => sum + call.totalTokens, 0);
  const closed = conversations.filter((conversation) => ['PAID', 'COMPLETED'].includes(conversation.status)).length;

  return {
    revenue,
    ordersToday: todayOrders.length,
    liveChats: live.length,
    handoffs: handoff.length,
    tokens,
    conversion: Math.round((closed / conversations.length) * 100),
  };
}

export function counts() {
  return {
    pendingOrders: orders.filter((order) => order.status === 'PENDING').length,
    handoff: conversations.filter((conversation) => conversation.status === 'HUMAN_HANDOFF').length,
    failedPayments: payments.filter((payment) => payment.status === 'FAILED').length,
  };
}
