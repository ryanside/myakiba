import { authClient } from '@/lib/auth-client';
import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/_layout/orders/$id')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/_layout/orders/$id"!</div>
}
