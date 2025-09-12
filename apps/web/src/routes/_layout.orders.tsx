import { createFileRoute } from '@tanstack/react-router'
import { client } from '@/lib/hono-client';
import { useQuery } from '@tanstack/react-query';

export const Route = createFileRoute('/_layout/orders')({
  component: RouteComponent,
})

function RouteComponent() {

  async function getOrders() {
    const response = await client.api.orders.$get({ query: {} });
    if (!response.ok) {
      throw new Error("Failed to get orders");
    }
    const data = await response.json();
    return data;
  }

  const { isPending, isError, data, error } = useQuery({
    queryKey: ["orders"],
    queryFn: getOrders,
    staleTime: Infinity,
    retry: false,
  });

  if (isPending) {
    return <div>Loading...</div>;
  }

  if (isError) {
    return <div>Error: {error.message}</div>;
  }

  const { orders } = data;

  return (
    <div className="container mx-auto max-w-3xl px-4 py-2">
      <h1>Orders</h1>
      <div className="grid gap-6">
        {orders.map((order) => (
          <div key={order.orderId}>{order.title}</div>
        ))}
      </div>
    </div>
  );
}
