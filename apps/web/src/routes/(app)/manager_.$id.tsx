import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/(app)/manager_/$id')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/manager/$id"!</div>
}
