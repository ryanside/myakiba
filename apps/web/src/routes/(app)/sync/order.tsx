import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Stepper,
  StepperContent,
  StepperIndicator,
  StepperItem,
  StepperNav,
  StepperPanel,
  StepperSeparator,
  StepperTitle,
} from "@/components/ui/stepper";
import { useState } from "react";
import { Check, Loader2, LoaderCircleIcon } from "lucide-react";
import { ShimmeringText } from "@/components/ui/shimmering-text";
import { extractMfcItemId } from "@/lib/sync/utils";
import {
  type SyncStatus,
  type SyncOrder,
  type SyncFormOrder,
} from "@/lib/sync/types";
import { toast } from "sonner";
import { getJobStatus, sendOrder } from "@/queries/sync";
import SyncOrderForm from "@/components/sync/sync-order-form";

const steps = [
  { title: "Choose sync option" },
  { title: "Enter Information" },
  { title: "Sync" },
];

export const Route = createFileRoute("/(app)/sync/order")({
  component: RouteComponent,
  head: () => ({
    meta: [
      {
        name: "description",
        content: "sync MyFigureCollection order to myakiba",
      },
      {
        title: "Sync Order - myakiba",
      },
    ],
  }),
});

function RouteComponent() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { session } = Route.useRouteContext();
  const userCurrency = session?.user.currency || "USD";
  const [currentStep, setCurrentStep] = useState(2);
  const [jobId, setJobId] = useState<string | null>(null);
  const [status, setStatus] = useState<SyncStatus>({
    existingItems: 0,
    newItems: 0,
    isFinished: true,
    status: "",
  });
  const jobStatusQuery = useQuery({
    queryKey: ["syncJobStatus", jobId] as const,
    enabled: jobId !== null,
    queryFn: async () => {
      if (!jobId) {
        throw new Error("jobId is required");
      }
      return await getJobStatus(jobId);
    },
    refetchInterval: (query) => {
      if (query.state.data?.finished === true) {
        return false;
      }
      return 2000;
    },
  });

  const isPollingError = jobId !== null && jobStatusQuery.isError;
  const resolvedStatus: SyncStatus = {
    ...status,
    isFinished:
      jobId === null
        ? status.isFinished
        : isPollingError
          ? true
          : (jobStatusQuery.data?.finished ?? false),
    status:
      jobId === null
        ? status.status
        : isPollingError
          ? "Connection error occurred"
          : jobStatusQuery.isLoading
            ? "Connecting..."
            : (jobStatusQuery.data?.status ?? status.status),
  };

  const orderMutation = useMutation({
    mutationFn: (order: SyncOrder) => sendOrder(order),
    onSuccess: (data) => {
      setCurrentStep(3);
      setStatus({
        existingItems: data.existingItemsToInsert,
        newItems: data.newItems,
        isFinished: data.isFinished,
        status: data.status,
      });
      setJobId(data.jobId ?? null);
    },
    onError: (error) => {
      toast.error("Failed to submit order. Please try again.", {
        description: `Error: ${error.message}`,
      });
    },
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["collection"] }),
        queryClient.invalidateQueries({ queryKey: ["orders"] }),
        queryClient.invalidateQueries({ queryKey: ["order"] }),
        queryClient.invalidateQueries({ queryKey: ["item"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
        queryClient.invalidateQueries({ queryKey: ["analytics"] }),
      ]);
    },
  });

  async function handleSyncOrderSubmit(values: SyncFormOrder) {
    const updatedValues: SyncOrder = {
      ...values,
      orderDate: values.orderDate || null,
      releaseMonthYear: values.releaseMonthYear || null,
      paymentDate: values.paymentDate || null,
      shippingDate: values.shippingDate || null,
      collectionDate: values.collectionDate || null,
      items: values.items.map((item) => {
        const extractedId = extractMfcItemId(item.itemId);
        if (!extractedId) {
          throw new Error(`Invalid item ID: ${item.itemId}`);
        }
        return {
          ...item,
          itemId: parseInt(extractedId),
          orderDate: item.orderDate || null,
          paymentDate: item.paymentDate || null,
          shippingDate: item.shippingDate || null,
          collectionDate: item.collectionDate || null,
        };
      }),
    };
    await orderMutation.mutateAsync(updatedValues);
  }

  return (
    <div className="container mx-auto max-w-5xl px-4 py-2">
      <Stepper
        value={currentStep}
        onValueChange={setCurrentStep}
        defaultValue={2}
        indicators={{
          completed: <Check className="size-4" />,
          loading: <LoaderCircleIcon className="size-4 animate-spin" />,
        }}
        className="space-y-8"
      >
        <StepperNav>
          {steps.map((step, index) => (
            <StepperItem
              key={index}
              step={index + 1}
              completed={index === 0}
              className="relative flex-1 items-start"
            >
              <div className="flex flex-col gap-3 items-center rounded-full outline-none">
                {index === 0 ? (
                  <button
                    onClick={() => navigate({ to: "/sync" })}
                    className="cursor-pointer border-none bg-transparent p-0"
                    type="button"
                  >
                    <StepperIndicator />
                  </button>
                ) : (
                  <StepperIndicator>{index + 1}</StepperIndicator>
                )}
                <StepperTitle>{step.title}</StepperTitle>
              </div>

              {steps.length > index + 1 && (
                <StepperSeparator className="absolute top-3 inset-x-0 left-[calc(50%+0.875rem)] m-0 group-data-[orientation=horizontal]/stepper-nav:w-[calc(100%-2rem+0.225rem)] group-data-[orientation=horizontal]/stepper-nav:flex-none group-data-[state=completed]/step:bg-primary" />
              )}
            </StepperItem>
          ))}
        </StepperNav>

        <StepperPanel className="text-sm">
          <StepperContent
            value={2}
            className="flex items-center justify-center"
          >
            <SyncOrderForm
              setCurrentStep={setCurrentStep}
              handleSyncOrderSubmit={handleSyncOrderSubmit}
              currency={userCurrency}
            />
          </StepperContent>
          <StepperContent
            value={3}
            className="flex items-center justify-center"
          >
            <div className="rounded-lg border p-4 space-y-4 gap4 w-full">
              <Label className="text-lg text-foreground">Status</Label>
              <div className="flex flex-row gap-2 items-center">
                {resolvedStatus.isFinished ? (
                  <p className="text-md text-pretty text-primary">
                    {resolvedStatus.status}
                  </p>
                ) : (
                  <>
                    <Loader2 className="animate-spin w-4 h-4" />
                    <ShimmeringText
                      text={resolvedStatus.status}
                      className="text-md"
                      color="var(--color-primary)"
                      shimmerColor="var(--color-white)"
                      duration={1.5}
                      repeatDelay={1}
                    />
                  </>
                )}
              </div>
              <div className="flex flex-row gap-2">
                <p className="text-sm text-pretty">
                  {status.existingItems} already in myakiba database
                </p>
                <p className="text-sm text-pretty">
                  {status.newItems} new items that needs to be scraped from MFC
                </p>
              </div>
              <div className="flex flex-row gap-2">
                <Button
                  variant="outline"
                  disabled={!resolvedStatus.isFinished}
                  onClick={() => {
                    navigate({ to: "/sync" });
                  }}
                >
                  Back to Sync Options
                </Button>
                <Link to="/orders">
                  <Button variant="primary" disabled={!resolvedStatus.isFinished}>
                    Go to Orders
                  </Button>
                </Link>
                <Link to="/collection">
                  <Button variant="primary" disabled={!resolvedStatus.isFinished}>
                    Go to Collection
                  </Button>
                </Link>
                <Link to="/dashboard">
                  <Button variant="primary" disabled={!resolvedStatus.isFinished}>
                    Go to Dashboard
                  </Button>
                </Link>
              </div>
            </div>
          </StepperContent>
        </StepperPanel>
      </Stepper>
    </div>
  );
}

