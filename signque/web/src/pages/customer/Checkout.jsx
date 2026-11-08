/**
 * Checkout: pick or add an address, see the server-computed summary, then pay
 * through Razorpay Checkout.
 *
 * The totals shown here come from POST /orders — the server recomputes them
 * from Product.basePrice, so nothing about money is decided in the browser.
 */

import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '../../lib/api';
import { money } from '../../lib/format';
import { Spinner, ErrorPanel, Field, PageHeader, MoneyRow } from '../../components/ui';

const EMPTY_ADDRESS = {
  fullName: '',
  phone: '',
  line1: '',
  line2: '',
  city: '',
  state: '',
  pincode: '',
};

export default function Checkout() {
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const items = location.state?.items;
  const preview = location.state?.preview;

  const [addressId, setAddressId] = useState(null);
  const [adding, setAdding] = useState(false);
  const [newAddress, setNewAddress] = useState(EMPTY_ADDRESS);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState('idle');

  const { data: products } = useQuery({
    queryKey: ['products'],
    queryFn: () => api.get('/products'),
    enabled: Boolean(items),
  });

  const { data: addressData, isLoading, error: loadError, refetch } = useQuery({
    queryKey: ['addresses'],
    queryFn: () => api.get('/addresses'),
  });

  const addresses = addressData?.addresses || [];

  useEffect(() => {
    if (addressId == null && addresses.length > 0) {
      setAddressId((addresses.find((a) => a.isDefault) || addresses[0]).id);
    }
    if (addresses.length === 0 && !isLoading) setAdding(true);
  }, [addresses, addressId, isLoading]);

  if (!items || items.length === 0) {
    return (
      <div className="card-pad mx-auto max-w-md text-center">
        <p className="font-semibold">Nothing to check out</p>
        <p className="mt-1 text-sm text-ink-faint">
          Choose a frame and upload your photo to start an order.
        </p>
        <Link to="/" className="btn-primary mt-4">
          Browse frames
        </Link>
      </div>
    );
  }

  if (isLoading) return <Spinner />;
  if (loadError) return <ErrorPanel error={loadError} onRetry={refetch} />;

  const productsById = new Map((products?.products || []).map((p) => [p.id, p]));

  // Shown for information only. The order's real totals come back from the API.
  const estimated = items.reduce((sum, item) => {
    const product = productsById.get(item.productId);
    return sum + (product ? Number(product.basePrice) * item.quantity : 0);
  }, 0);

  async function saveAddress(event) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const payload = { ...newAddress };
      if (!payload.line2) delete payload.line2;
      const { address } = await api.post('/addresses', payload);
      await queryClient.invalidateQueries({ queryKey: ['addresses'] });
      setAddressId(address.id);
      setAdding(false);
      setNewAddress(EMPTY_ADDRESS);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  /** Create the order, then hand its Razorpay order to Checkout. */
  async function payNow() {
    if (!addressId) {
      setError('Choose a delivery address first.');
      return;
    }

    setBusy(true);
    setError(null);
    setStage('creating');

    let created;
    try {
      created = await api.post('/orders', { addressId, items });
    } catch (err) {
      setError(err.message);
      setBusy(false);
      setStage('idle');
      return;
    }

    const { order, razorpay } = created;

    if (!window.Razorpay) {
      setBusy(false);
      setStage('idle');
      setError(
        'The payment window could not load. Your order is saved — open it from My orders to pay.',
      );
      navigate(`/orders/${order.id}`);
      return;
    }

    setStage('paying');

    const checkout = new window.Razorpay({
      key: razorpay.keyId,
      order_id: razorpay.orderId,
      amount: razorpay.amount,
      currency: razorpay.currency,
      name: 'SIGNQUE',
      description: `Order ${order.orderNumber}`,
      handler: async (response) => {
        // Fast feedback only — the webhook is what actually places the order.
        try {
          await api.post(`/orders/${order.id}/verify-payment`, {
            razorpayOrderId: response.razorpay_order_id,
            razorpayPaymentId: response.razorpay_payment_id,
            razorpaySignature: response.razorpay_signature,
          });
        } catch {
          // Even if this call fails, the webhook still settles the order.
        }
        await queryClient.invalidateQueries({ queryKey: ['my-orders'] });
        navigate(`/orders/${order.id}`, { state: { justPaid: true } });
      },
      modal: {
        ondismiss: () => {
          setBusy(false);
          setStage('idle');
          navigate(`/orders/${order.id}`);
        },
      },
      theme: { color: '#1c1917' },
    });

    checkout.open();
  }

  return (
    <div>
      <PageHeader title="Checkout" subtitle="Confirm where it goes, then pay." />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-4">
          <section className="card-pad">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold">Delivery address</h2>
              {!adding && (
                <button type="button" className="btn-secondary btn-sm" onClick={() => setAdding(true)}>
                  Add new
                </button>
              )}
            </div>

            {addresses.length > 0 && !adding && (
              <div className="space-y-2">
                {addresses.map((address) => (
                  <label
                    key={address.id}
                    className={`flex cursor-pointer gap-3 rounded-lg border p-3 ${
                      addressId === address.id ? 'border-ink bg-stone-50' : 'border-stone-200'
                    }`}
                  >
                    <input
                      type="radio"
                      name="address"
                      className="mt-1"
                      checked={addressId === address.id}
                      onChange={() => setAddressId(address.id)}
                    />
                    <div className="text-sm">
                      <p className="font-semibold">
                        {address.fullName}
                        {address.isDefault && (
                          <span className="ml-2 rounded-full border border-stone-300 px-1.5 py-0.5 text-[10px] font-bold uppercase text-ink-faint">
                            Default
                          </span>
                        )}
                      </p>
                      <p className="text-ink-soft">
                        {address.line1}
                        {address.line2 ? `, ${address.line2}` : ''}
                      </p>
                      <p className="text-ink-soft">
                        {address.city}, {address.state} {address.pincode}
                      </p>
                      <p className="text-ink-faint">{address.phone}</p>
                    </div>
                  </label>
                ))}
              </div>
            )}

            {adding && (
              <form onSubmit={saveAddress} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Field label="Full name">
                    <input
                      required
                      className="input"
                      value={newAddress.fullName}
                      onChange={(e) => setNewAddress({ ...newAddress, fullName: e.target.value })}
                    />
                  </Field>
                </div>
                <Field label="Phone">
                  <input
                    required
                    className="input"
                    value={newAddress.phone}
                    onChange={(e) => setNewAddress({ ...newAddress, phone: e.target.value })}
                  />
                </Field>
                <Field label="Pincode">
                  <input
                    required
                    inputMode="numeric"
                    pattern="[1-9][0-9]{5}"
                    className="input"
                    value={newAddress.pincode}
                    onChange={(e) => setNewAddress({ ...newAddress, pincode: e.target.value })}
                  />
                </Field>
                <div className="sm:col-span-2">
                  <Field label="Address line 1">
                    <input
                      required
                      className="input"
                      value={newAddress.line1}
                      onChange={(e) => setNewAddress({ ...newAddress, line1: e.target.value })}
                    />
                  </Field>
                </div>
                <div className="sm:col-span-2">
                  <Field label="Address line 2" hint="Optional.">
                    <input
                      className="input"
                      value={newAddress.line2}
                      onChange={(e) => setNewAddress({ ...newAddress, line2: e.target.value })}
                    />
                  </Field>
                </div>
                <Field label="City">
                  <input
                    required
                    className="input"
                    value={newAddress.city}
                    onChange={(e) => setNewAddress({ ...newAddress, city: e.target.value })}
                  />
                </Field>
                <Field label="State">
                  <input
                    required
                    className="input"
                    value={newAddress.state}
                    onChange={(e) => setNewAddress({ ...newAddress, state: e.target.value })}
                  />
                </Field>

                <div className="flex gap-2 sm:col-span-2">
                  <button type="submit" className="btn-primary btn-sm" disabled={busy}>
                    Save address
                  </button>
                  {addresses.length > 0 && (
                    <button
                      type="button"
                      className="btn-secondary btn-sm"
                      onClick={() => setAdding(false)}
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </form>
            )}
          </section>

          <section className="card-pad">
            <h2 className="mb-3 font-semibold">What you are ordering</h2>
            <div className="space-y-3">
              {items.map((item, index) => {
                const product = productsById.get(item.productId);
                return (
                  <div key={index} className="flex gap-3">
                    <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-stone-100">
                      {preview ? (
                        <img src={preview} alt="" className="h-full w-full object-cover" />
                      ) : null}
                    </div>
                    <div className="text-sm">
                      <p className="font-medium">{product?.title || `Product #${item.productId}`}</p>
                      <p className="text-ink-faint">Quantity: {item.quantity}</p>
                      {product && <p className="text-ink-faint">{money(product.basePrice)} each</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>

        <aside className="card-pad h-fit lg:sticky lg:top-24">
          <h2 className="mb-2 font-semibold">Summary</h2>
          <MoneyRow label="Items" amount={estimated} />
          <p className="py-1.5 text-sm text-ink-faint">
            Shipping is added by our server at the final total.
          </p>
          <div className="mt-2 border-t border-stone-200 pt-2">
            <p className="text-xs text-ink-faint">
              The exact total — items plus shipping — is calculated on our server when the order is
              created, and that is the amount you will be charged.
            </p>
          </div>

          {error && (
            <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </p>
          )}

          <button
            type="button"
            className="btn-primary mt-4 w-full"
            onClick={payNow}
            disabled={busy || !addressId}
          >
            {stage === 'creating'
              ? 'Creating your order…'
              : stage === 'paying'
                ? 'Waiting for payment…'
                : 'Pay now'}
          </button>
        </aside>
      </div>
    </div>
  );
}
