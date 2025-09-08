import { createFileRoute } from '@tanstack/react-router'
import { authClient } from '@/lib/auth-client'
import { redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/_layout/orders')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/_layout/orders"!</div>
}
