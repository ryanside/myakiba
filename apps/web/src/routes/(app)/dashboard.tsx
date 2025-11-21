import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { client } from "@/lib/hono-client";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  DollarSign,
  Star,
  PiggyBank,
  Flame,
  CalendarIcon,
  NotepadText,
  ChartPie,
  ShoppingBasket,
  Package,
  Plus,
  User,
  ArrowRight,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import { CollectionBreakdown } from "@/components/dashboard/collection-breakdown";
import { BudgetControlCard } from "@/components/dashboard/budget-control-card";
import { ReleaseCalendar } from "@/components/dashboard/release-calendar";
import { UnpaidOrders } from "@/components/dashboard/unpaid-orders";
import { formatCurrency } from "@/lib/utils";
import { authClient } from "@/lib/auth-client";
import { DashboardSkeleton } from "@/components/skeletons/dashboard-skeleton";
import { Button } from "@/components/ui/button";
import OrderKanban from "@/components/dashboard/order-kanban";
import { Badge } from "@/components/ui/badge";
import { ValueLineBarChart } from "@/components/ui/value-line-bar-chart";
import { KPICard } from "@/components/ui/kpi-card";

export const Route = createFileRoute("/(app)/dashboard")({
  component: RouteComponent,
  head: ({ params }) => ({
    meta: [
      {
        name: "description",
        content: `your dashboard`,
      },
      {
        title: `Dashboard — myakiba`,
      },
    ],
    links: [
      {
        rel: "icon",
        href: "/favicon.ico",
      },
    ],
    scripts: [],
  }),
});

function RouteComponent() {
  return <DashboardContent />;
}

function DashboardContent() {
  const navigate = useNavigate();
  const { data: session } = authClient.useSession();
  const userCurrency = session?.user.currency || "USD";

  async function getDashboard() {
    const response = await client.api.dashboard.$get();

    if (!response.ok) {
      throw new Error("Failed to get dashboard");
    }
    const data = await response.json();
    return data;
  }

  const { isPending, isError, data, error } = useQuery({
    queryKey: ["dashboard"],
    queryFn: getDashboard,
    staleTime: 1000 * 60 * 5,
    retry: false,
  });

  if (isPending) {
    return <DashboardSkeleton />;
  }

  if (isError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-destructive">Error</CardTitle>
          <CardDescription>
            Failed to load dashboard data: {error.message}
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const { dashboard } = data;
  const {
    collectionStats,
    categoriesOwned,
    orders,
    ordersSummary,
    budgetSummary,
    unpaidOrders,
    monthlyOrders,
  } = dashboard;

  return (
    <div className="">
      <div className="flex flex-col lg:flex-row items-start mb-6 gap-4">
        <h1 className="text-2xl tracking-tight ">
          Welcome,{" "}
          <span className="text-muted-foreground">
            {session?.user.username} (づ｡◕‿‿◕｡)づ
          </span>
        </h1>
        <div className="flex flex-row flex-wrap items-center gap-2 lg:ml-auto">
          <Button
            variant="outline"
            size="md"
            onClick={() => {
              navigate({
                to: "/sync/collection",
              });
            }}
          >
            <Plus className="h-4 w-4" />
            Add Collection Item
          </Button>
          <Button
            variant="outline"
            size="md"
            onClick={() => {
              navigate({
                to: "/sync/order",
              });
            }}
          >
            <Plus className="h-4 w-4" />
            Add Order
          </Button>
          <Button
            className="bg-gradient-to-br from-background via-muted to-background text-foreground dark:!border-border"
            size="md"
            onClick={() => {
              navigate({
                to: "/profile/$username",
                params: {
                  username: session?.user.username ?? "",
                },
              });
            }}
          >
            <User className="h-4 w-4" />
            View Profile
          </Button>
        </div>
      </div>
      <div className="grid gap-4 grid-cols-1 lg:grid-cols-4">
        <div className="col-span-1 lg:col-span-3 border-dashed space-y-4 flex flex-col">
          <div className="grid gap-4 grid-cols-1 lg:grid-cols-3 border-dashed">
            <div className="col-span-1 lg:col-span-3 grid grid-cols-1 lg:grid-cols-3 gap-4">
              <CollectionBreakdown
                data={categoriesOwned}
                currency={userCurrency}
              />
              <ValueLineBarChart data={monthlyOrders} />
              <div className="flex flex-col gap-4 col-span-1 h-full">
                <KPICard
                  title="Total Spent"
                  subtitle="based on paid collection & order items"
                  value={formatCurrency(
                    collectionStats[0].totalSpent,
                    userCurrency
                  )}
                  subvalueTitle="this month"
                  subvalue={formatCurrency(
                    collectionStats[0].totalSpentThisMonth +
                      ordersSummary[0].thisMonthShipping +
                      ordersSummary[0].thisMonthTaxes +
                      ordersSummary[0].thisMonthDuties +
                      ordersSummary[0].thisMonthTariffs +
                      ordersSummary[0].thisMonthMiscFees,
                    userCurrency
                  )}
                />
                <KPICard
                  title="Active Orders"
                  subtitle="orders not yet collected"
                  value={ordersSummary[0].totalActiveOrderCount}
                  subvalueTitle="unpaid"
                  subvalue={unpaidOrders.length}
                />
              </div>
            </div>
          </div>
          <Card className="col-span-1 lg:col-span-3 h-full">
            <CardHeader className="flex flex-row items-center gap-2">
              <div className="flex flex-col items-start gap-2">
                <CardTitle className="text-md font-medium">
                  Orders Board
                </CardTitle>
                <CardDescription className="text-xs text-muted-foreground">
                  Quickly manage upcoming active orders
                </CardDescription>
              </div>
              <Link to="/orders" className="ml-auto">
                <Button variant="outline" size="md" className="rounded-md">
                  View All
                </Button>
              </Link>
            </CardHeader>
            <CardContent className="h-full">
              <OrderKanban orders={orders} currency={userCurrency} />
            </CardContent>
          </Card>
        </div>
        <div className="col-span-1 space-y-4 flex flex-col">
          <BudgetControlCard
            currentSpent={
              budgetSummary.length > 0
                ? parseFloat(
                    collectionStats[0].totalSpentThisMonth.toString()
                  ) +
                  parseFloat(ordersSummary[0].thisMonthShipping.toString()) +
                  parseFloat(ordersSummary[0].thisMonthTaxes.toString()) +
                  parseFloat(ordersSummary[0].thisMonthDuties.toString()) +
                  parseFloat(ordersSummary[0].thisMonthTariffs.toString()) +
                  parseFloat(ordersSummary[0].thisMonthMiscFees.toString())
                : undefined
            }
            limit={
              budgetSummary.length > 0
                ? parseFloat(budgetSummary[0].amount.toString())
                : undefined
            }
            currency={userCurrency}
            warningThreshold={75}
          />
          <Card className="min-h-[210px]">
            <CardHeader className="flex flex-row items-center gap-2">
              <CardTitle className="text-md font-medium">
                Release Calendar
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ReleaseCalendar currency={userCurrency} />
            </CardContent>
          </Card>
          <Card className="flex-1">
            <CardHeader className="flex flex-row items-center gap-2">
              <CardTitle className="text-md font-medium">
                Unpaid Orders
              </CardTitle>
              <Badge variant="outline">{unpaidOrders.length}</Badge>
              <Badge variant="warning" appearance="outline">
                {formatCurrency(
                  unpaidOrders.reduce(
                    (acc, order) => acc + parseFloat(order.total),
                    0
                  ),
                  userCurrency
                )}
              </Badge>
            </CardHeader>
            <CardContent>
              <UnpaidOrders orders={unpaidOrders} currency={userCurrency} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
