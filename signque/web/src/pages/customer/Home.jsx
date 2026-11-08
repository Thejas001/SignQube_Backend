import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';

import { api } from '../../lib/api';
import { money } from '../../lib/format';
import { Spinner, ErrorPanel, EmptyState, PageHeader } from '../../components/ui';

export default function Home() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['products'],
    queryFn: () => api.get('/products'),
  });

  if (isLoading) return <Spinner label="Loading the catalogue…" />;
  if (error) return <ErrorPanel error={error} onRetry={refetch} />;

  const products = data?.products || [];

  return (
    <div>
      <PageHeader
        title="Custom acrylic photo frames"
        subtitle="Pick a frame, upload your photo, and our designers lay it out for you before anything is printed."
      />

      {products.length === 0 ? (
        <EmptyState title="No products yet" hint="The catalogue is empty — check back soon." />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((product) => (
            <Link
              key={product.id}
              to={`/products/${product.id}`}
              className="card group overflow-hidden transition hover:border-stone-400"
            >
              <div className="flex aspect-[4/3] items-center justify-center bg-stone-100">
                {product.imageUrl ? (
                  <img
                    src={product.imageUrl}
                    alt={product.title}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="text-4xl" aria-hidden="true">
                    🖼️
                  </span>
                )}
              </div>
              <div className="p-4">
                <h2 className="font-semibold group-hover:underline">{product.title}</h2>
                {product.description && (
                  <p className="mt-1 line-clamp-2 text-sm text-ink-faint">{product.description}</p>
                )}
                <p className="mt-3 font-bold">{money(product.basePrice)}</p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
