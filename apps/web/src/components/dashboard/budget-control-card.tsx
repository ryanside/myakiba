import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Settings, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { formatCurrencyFromMinorUnits } from "@myakiba/utils";
import { Progress } from "../ui/progress";
import { Link } from "@tanstack/react-router";

interface BudgetControlCardProps {
  currentSpent?: number;
  limit?: number;
  period?: string;
  currency: string;
  warningThreshold?: number; // percentage at which to show warning (default 80%)
}

export function BudgetControlCard({
  currentSpent = 0,
  limit,
  period = "Monthly",
  currency,
  warningThreshold = 80,
}: BudgetControlCardProps) {
  const hasBudget = limit !== undefined && limit > 0;
  const percentageUsed = hasBudget ? (currentSpent / limit) * 100 : 0;
  const showWarning = hasBudget && percentageUsed >= warningThreshold && percentageUsed < 100;
  const showOverflow = hasBudget && percentageUsed >= 100;

  return (
    <Card className="">
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-md font-medium">Budget Control</CardTitle>
        <Link to="/settings">
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <Settings className="h-4 w-4" />
          </Button>
        </Link>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-3">
          <p className="text-muted-foreground text-xs">{period} transaction limit</p>

          <div className="space-y-1">
            {hasBudget ? (
              <div className="flex items-baseline gap-1.5">
                <span className="text-xl font-medium tracking-tight">
                  {formatCurrencyFromMinorUnits(currentSpent, currency)}
                </span>
                <span className="text-muted-foreground text-sm">
                  of {formatCurrencyFromMinorUnits(limit, currency)}
                </span>
              </div>
            ) : (
              <div className="flex items-baseline gap-1.5">
                <span className="text-xl text-foreground">No budget set</span>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Progress value={percentageUsed} />
          </div>
        </div>

        {showWarning && (
          <Alert
            variant="destructive"
            className="bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900 py-2"
          >
            <AlertTriangle className="size-3 text-red-600 dark:text-red-500" />
            <AlertDescription className="text-red-800 dark:text-red-400 text-xs ">
              You're nearing the top of your spending limit
            </AlertDescription>
          </Alert>
        )}
        {showOverflow && (
          <Alert
            variant="destructive"
            className="bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900"
          >
            <AlertTriangle className="size-3 text-red-600 dark:text-red-500" />
            <AlertDescription className="text-red-800 dark:text-red-400 text-xs ">
              You've exceeded your spending limit!
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
