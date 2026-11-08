import { useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';

import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { money } from '../../lib/format';
import { Spinner, ErrorPanel, Field, PageHeader } from '../../components/ui';

const MAX_PHOTO_BYTES = 15 * 1024 * 1024;
const ALLOWED = ['image/jpeg', 'image/png', 'image/heic', 'image/heif'];

export default function ProductDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const fileInput = useRef(null);

  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [quantity, setQuantity] = useState(1);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const { data, isLoading, error: loadError, refetch } = useQuery({
    queryKey: ['product', id],
    queryFn: () => api.get(`/products/${id}`),
  });

  if (isLoading) return <Spinner />;
  if (loadError) return <ErrorPanel error={loadError} onRetry={refetch} />;

  const product = data.product;

  function choose(event) {
    const chosen = event.target.files?.[0];
    setError(null);
    if (!chosen) return;

    if (!ALLOWED.includes(chosen.type)) {
      setError('Please choose a JPG, PNG or HEIC photo.');
      return;
    }
    if (chosen.size > MAX_PHOTO_BYTES) {
      setError('That photo is larger than 15 MB. Please choose a smaller one.');
      return;
    }

    setFile(chosen);
    setPreview(URL.createObjectURL(chosen));
  }

  /** Upload the photo, pin it to the product, then go to checkout. */
  async function orderNow() {
    if (!user) {
      navigate('/login', { state: { from: `/products/${id}` } });
      return;
    }
    if (!file) {
      setError('Upload the photo you would like printed first.');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('photo', file);
      const uploaded = await api.upload('/uploads/photo', formData);

      const { customization } = await api.post('/customizations', {
        productId: product.id,
        photoUrl: uploaded.url,
        photoKey: uploaded.key,
      });

      navigate('/checkout', {
        state: {
          items: [{ productId: product.id, customizationId: customization.id, quantity }],
          preview,
        },
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader title={product.title} subtitle={money(product.basePrice)} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="card overflow-hidden">
          <div className="flex aspect-[4/3] items-center justify-center bg-stone-100">
            {preview ? (
              <img src={preview} alt="Your photo" className="h-full w-full object-contain" />
            ) : product.imageUrl ? (
              <img src={product.imageUrl} alt={product.title} className="h-full w-full object-cover" />
            ) : (
              <span className="text-5xl" aria-hidden="true">
                🖼️
              </span>
            )}
          </div>
          {preview && (
            <p className="border-t border-stone-200 px-4 py-2 text-xs text-ink-faint">
              This is your photo, not the finished design. A designer lays it out and you approve it
              before anything is printed.
            </p>
          )}
        </div>

        <div className="space-y-5">
          {product.description && <p className="text-sm text-ink-soft">{product.description}</p>}

          <div className="card-pad space-y-4">
            <Field label="Your photo" hint="JPG, PNG or HEIC, up to 15 MB.">
              <input
                ref={fileInput}
                type="file"
                accept="image/jpeg,image/png,image/heic,image/heif"
                onChange={choose}
                className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-ink file:px-4 file:py-2 file:text-sm file:font-semibold file:text-stone-50 hover:file:bg-stone-700"
              />
            </Field>

            {file && (
              <p className="text-xs text-ink-faint">
                {file.name} · {(file.size / (1024 * 1024)).toFixed(1)} MB
              </p>
            )}

            <Field label="Quantity">
              <input
                type="number"
                min={1}
                max={99}
                className="input w-24"
                value={quantity}
                onChange={(e) => setQuantity(Math.max(1, Math.min(99, Number(e.target.value) || 1)))}
              />
            </Field>

            {error && (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                {error}
              </p>
            )}

            <button type="button" className="btn-primary w-full" onClick={orderNow} disabled={busy}>
              {busy ? 'Uploading…' : 'Order now'}
            </button>

            <p className="text-xs text-ink-faint">
              Prices and totals are calculated on our server at checkout.
            </p>
          </div>

          <ol className="card-pad space-y-2 text-sm text-ink-soft">
            <p className="label">How it works</p>
            <li>1. Upload your photo and place the order.</li>
            <li>2. Our team checks the photo quality.</li>
            <li>3. A designer lays out your frame.</li>
            <li>4. You review and approve the design.</li>
            <li>5. We print it and let you know when it is done.</li>
          </ol>
        </div>
      </div>
    </div>
  );
}
