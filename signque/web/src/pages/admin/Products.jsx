import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import { api } from '../../lib/api';
import { money } from '../../lib/format';
import { Spinner, ErrorPanel, PageHeader, Field, Toast } from '../../components/ui';

const EMPTY = { title: '', description: '', basePrice: '', imageUrl: '' };

export default function Products() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(EMPTY);
  const [editingId, setEditingId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [toast, setToast] = useState(null);
  const [actionError, setActionError] = useState(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['admin-products'],
    queryFn: () => api.get('/admin/products'),
  });

  function done(message) {
    return async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin-products'] });
      await queryClient.invalidateQueries({ queryKey: ['products'] });
      setForm(EMPTY);
      setEditingId(null);
      setShowForm(false);
      setToast({ message, tone: 'ok' });
    };
  }

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        title: form.title,
        basePrice: Number(form.basePrice),
        ...(form.description ? { description: form.description } : {}),
        ...(form.imageUrl ? { imageUrl: form.imageUrl } : {}),
      };
      return editingId
        ? api.patch(`/admin/products/${editingId}`, payload)
        : api.post('/admin/products', payload);
    },
    onMutate: () => setActionError(null),
    onSuccess: done(editingId ? 'Product updated.' : 'Product created.'),
    onError: (err) => setActionError(err),
  });

  const toggleActive = useMutation({
    mutationFn: ({ id, isActive }) => api.patch(`/admin/products/${id}`, { isActive }),
    onSuccess: done('Product updated.'),
    onError: (err) => setActionError(err),
  });

  function startEdit(product) {
    setEditingId(product.id);
    setForm({
      title: product.title,
      description: product.description || '',
      basePrice: String(product.basePrice),
      imageUrl: product.imageUrl || '',
    });
    setShowForm(true);
  }

  return (
    <div>
      <Toast message={toast?.message} tone={toast?.tone} onDone={() => setToast(null)} />

      <PageHeader
        title="Products"
        subtitle="Base prices here are the only prices the system will charge."
        actions={
          <button
            type="button"
            className="btn-primary btn-sm"
            onClick={() => {
              setEditingId(null);
              setForm(EMPTY);
              setShowForm((v) => !v);
            }}
          >
            {showForm ? 'Close' : 'New product'}
          </button>
        }
      />

      {actionError && (
        <div className="mb-4">
          <ErrorPanel error={actionError} />
        </div>
      )}

      {showForm && (
        <form
          className="card-pad mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <div className="sm:col-span-2">
            <Field label="Title">
              <input
                required
                className="input"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </Field>
          </div>
          <Field label="Base price (₹)">
            <input
              required
              type="number"
              min="0"
              step="0.01"
              className="input"
              value={form.basePrice}
              onChange={(e) => setForm({ ...form, basePrice: e.target.value })}
            />
          </Field>
          <Field label="Image URL" hint="Optional.">
            <input
              type="url"
              className="input"
              value={form.imageUrl}
              onChange={(e) => setForm({ ...form, imageUrl: e.target.value })}
            />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Description" hint="Optional.">
              <textarea
                className="input min-h-[80px]"
                maxLength={5000}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </Field>
          </div>
          <div className="flex gap-2 sm:col-span-2">
            <button type="submit" className="btn-primary" disabled={save.isPending}>
              {save.isPending ? 'Saving…' : editingId ? 'Save changes' : 'Create product'}
            </button>
            {editingId && (
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  setEditingId(null);
                  setForm(EMPTY);
                  setShowForm(false);
                }}
              >
                Cancel
              </button>
            )}
          </div>
        </form>
      )}

      {isLoading ? (
        <Spinner />
      ) : error ? (
        <ErrorPanel error={error} onRetry={refetch} />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.products.map((product) => (
            <div key={product.id} className={`card overflow-hidden ${product.isActive ? '' : 'opacity-60'}`}>
              <div className="flex aspect-[4/3] items-center justify-center bg-stone-100">
                {product.imageUrl ? (
                  <img src={product.imageUrl} alt={product.title} className="h-full w-full object-cover" />
                ) : (
                  <span className="text-4xl" aria-hidden="true">
                    🖼️
                  </span>
                )}
              </div>
              <div className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="font-semibold">{product.title}</h2>
                  {!product.isActive && (
                    <span className="chip border-stone-300 bg-stone-100 text-stone-600">Hidden</span>
                  )}
                </div>
                {product.description && (
                  <p className="mt-1 line-clamp-2 text-sm text-ink-faint">{product.description}</p>
                )}
                <p className="mt-2 font-bold">{money(product.basePrice)}</p>

                <div className="mt-3 flex gap-2">
                  <button type="button" className="btn-secondary btn-sm" onClick={() => startEdit(product)}>
                    Edit
                  </button>
                  <button
                    type="button"
                    className={product.isActive ? 'btn-danger btn-sm' : 'btn-secondary btn-sm'}
                    disabled={toggleActive.isPending}
                    onClick={() => toggleActive.mutate({ id: product.id, isActive: !product.isActive })}
                  >
                    {product.isActive ? 'Deactivate' : 'Activate'}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
