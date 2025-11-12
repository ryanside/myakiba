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
import { CollectionBreakdownPieChart } from "@/components/dashboard/CollectionBreakdownPieChart";
import { ChartBarLabelCustom } from "@/components/dashboard/chart-bar-label-custom";
import { BudgetControlCard } from "@/components/dashboard/budget-control-card";
import { ReleaseCalendar } from "@/components/dashboard/release-calendar";
import { UnpaidOrders } from "@/components/dashboard/unpaid-orders";
import { formatCurrency } from "@/lib/utils";
import { authClient } from "@/lib/auth-client";
import { DashboardSkeleton } from "@/components/skeletons/dashboard-skeleton";
import { Button } from "@/components/ui/button";
import OrderKanban from "@/components/dashboard/OrderKanban";
import { Badge } from "@/components/ui/badge";

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
  } = dashboard;

  return (
    <div className="">
      <div className="flex flex-col lg:flex-row items-start mb-6 gap-4">
        <h2 className="text-2xl tracking-tight">
          Welcome, {session?.user.name}
        </h2>
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
            className="bg-gradient-to-br from-background via-muted to-background text-foreground border"
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
            Go to Profile
          </Button>
        </div>
      </div>
      <div className="grid gap-4 grid-cols-1 lg:grid-cols-4">
        {/* Outer Layout */}
        <div className="col-span-1 lg:col-span-3 border-dashed space-y-4 flex flex-col">
          {/* Inner Layout */}
          <div className="grid gap-4 grid-cols-1 lg:grid-cols-3 border-dashed">
            <div className="col-span-1 lg:col-span-3 grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="col-span-1 lg:col-span-2">
                <CollectionBreakdownPieChart
                  data={categoriesOwned}
                  currency={userCurrency}
                />
              </div>
              <div className="flex flex-col gap-4 col-span-1 border-dashed h-full">
                <StatsCard
                  title="Total Spent"
                  value={formatCurrency(
                    collectionStats[0].totalSpent,
                    userCurrency
                  )}
                  subtitle="This Month"
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
                <StatsCard
                  title="Active Orders"
                  value={ordersSummary[0].totalActiveOrderCount}
                  subtitle="Unpaid"
                  subvalue={unpaidOrders.length}
                />
              </div>
            </div>
          </div>
          <Card className="col-span-1 lg:col-span-3 h-full">
            <CardHeader className="flex flex-row items-center gap-2">
              <CardTitle className="text-md font-medium">
                Orders Board
              </CardTitle>
              <Link to="/orders" className="ml-auto">
                <Button variant="outline" size="sm" className="rounded-md">
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

function StatsCard({
  title,
  value,
  subtitle,
  subvalue,
}: {
  title: string;
  value: string | number;
  subtitle?: string;
  subvalue?: string | number;
}) {
  return (
    <Card className="flex-1 flex flex-col ">
      <CardHeader className="flex flex-row items-center gap-2">
        <CardTitle className="text-md font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-row items-baseline w-full">
          <p className="text-xl font-medium">{value}</p>
          {subtitle && subvalue && (
            <div className="flex-row gap-1 ml-2 flex">
              <p className="text-xs text-muted-foreground  font-light">
                {subvalue}
              </p>
              <p className="text-xs text-muted-foreground font-light">
                {subtitle}
              </p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
