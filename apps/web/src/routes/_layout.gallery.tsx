import { authClient } from '@/lib/auth-client';
import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/_layout/gallery')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/_layout/gallery"!</div>
}
