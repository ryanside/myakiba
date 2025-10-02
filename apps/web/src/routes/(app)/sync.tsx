import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
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
import { tryCatch } from "@/lib/utils";
import { ShimmeringText } from "@/components/ui/shimmering-text";
import { transformCSVData } from "@/lib/sync/utils";
import {
  type userItem,
  type status,
  type SyncOrder,
  type SyncCollectionItem,
} from "@/lib/sync/types";
import { toast } from "sonner";
import { sendItems, getJobStatus } from "@/queries/sync";
import ChooseSyncOption from "@/components/sync/choose-sync-option";
import SyncOrderForm from "@/components/sync/sync-order-form";
import SyncCollectionForm from "@/components/sync/sync-collection-form";
import SyncCsvForm from "@/components/sync/sync-csv-form";

const steps = [
  { title: "Choose sync option" },
  { title: "Enter Information" },
  { title: "Sync" },
];

export const Route = createFileRoute("/(app)/sync")({
  component: RouteComponent,
});

function RouteComponent() {
  const queryClient = useQueryClient();

  const [currentStep, setCurrentStep] = useState(1);
  const [syncOption, setSyncOption] = useState<
    "csv" | "order" | "collection" | ""
  >("");
  const [status, setStatus] = useState<status>({
    existingItems: 0,
    newItems: 0,
    isFinished: true,
    status: "",
  });

  const csvMutation = useMutation({
    mutationFn: (userItems: userItem[]) => sendItems(userItems),
    onError: (error) => {
      toast.error("Failed to submit CSV. Please try again.", {
        description: `Error: ${error.message}`,
      });
    },
  });

  async function handleSyncCsvSubmit(value: File | undefined) {
    const { data: userItems, error: transformCSVDataError } = await tryCatch(
      transformCSVData({ file: value })
    );
    if (transformCSVDataError) {
      console.error("Error transforming CSV data", transformCSVDataError);
      return transformCSVDataError instanceof Error
        ? transformCSVDataError.message
        : "An error occurred";
    }

    const data = await csvMutation.mutateAsync(userItems);

    setCurrentStep(3);

    if (data.jobId) {
      const jobId = data.jobId;
      const interval = setInterval(async () => {
        const { data, error } = await tryCatch(
          queryClient.fetchQuery({
            queryKey: ["job-status", jobId],
            queryFn: () => getJobStatus(jobId),
          })
        );

        if (error) {
          clearInterval(interval);
          console.log(error);
          setStatus((prev) => ({
            ...prev,
            isFinished: true,
            status: "An error occurred",
          }));
          return;
        }

        console.log(data?.status);
        setStatus((prev) => ({
          ...prev,
          isFinished: data?.finished,
          status: data?.status,
        }));

        if (data?.finished) {
          clearInterval(interval);
          setStatus((prev) => ({
            ...prev,
            isFinished: data?.finished,
            status: data?.status,
          }));
          return;
        }
      }, 3000);
    } else {
      setStatus({
        existingItems: data.existingItemsToInsert,
        newItems: data.newItems,
        isFinished: data.isFinished,
        status: data.status,
      });
    }
  }

  function handleSyncOrderSubmit(values: SyncOrder) {
    console.log(JSON.stringify(values, null, 2));
  }

  function handleSyncCollectionSubmit(values: SyncCollectionItem[]) {
    console.log(JSON.stringify(values, null, 2));
  }

  function handleSyncOption(option: "csv" | "order" | "collection") {
    setSyncOption(option);
    setCurrentStep(2);
  }

  return (
    <div className="container mx-auto max-w-5xl px-4 py-2">
      <Stepper
        value={currentStep}
        onValueChange={setCurrentStep}
        defaultValue={1}
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
              className="relative flex-1 items-start"
            >
              <div className="flex flex-col gap-3 items-center rounded-full outline-none">
                <StepperIndicator>{index + 1}</StepperIndicator>
                <StepperTitle>{step.title}</StepperTitle>
              </div>

              {steps.length > index + 1 && (
                <StepperSeparator className="absolute top-3 inset-x-0 left-[calc(50%+0.875rem)] m-0 group-data-[orientation=horizontal]/stepper-nav:w-[calc(100%-2rem+0.225rem)] group-data-[orientation=horizontal]/stepper-nav:flex-none group-data-[state=completed]/step:bg-primary" />
              )}
            </StepperItem>
          ))}
        </StepperNav>

        <StepperPanel className="text-sm">
          {steps.map((step, index) => (
            <StepperContent
              key={index}
              value={index + 1}
              className="flex items-center justify-center"
            >
              {index === 0 && (
                <ChooseSyncOption handleSyncOption={handleSyncOption} />
              )}
              {index === 1 && syncOption === "order" && (
                <SyncOrderForm
                  setCurrentStep={setCurrentStep}
                  handleSyncOrderSubmit={handleSyncOrderSubmit}
                />
              )}
              {index === 1 && syncOption === "collection" && (
                <SyncCollectionForm
                  setCurrentStep={setCurrentStep}
                  handleSyncCollectionSubmit={handleSyncCollectionSubmit}
                />
              )}
              {index === 1 && syncOption === "csv" && (
                <SyncCsvForm
                  setCurrentStep={setCurrentStep}
                  handleSyncCsvSubmit={handleSyncCsvSubmit}
                />
              )}
              {index === 2 && (
                <div className="rounded-lg border p-4 space-y-4 gap4 w-full">
                  <Label className="text-lg text-foreground">Status</Label>
                  <div className="flex flex-row gap-2 items-center">
                    {status.isFinished ? (
                      <p className="text-md text-pretty text-primary">
                        {status.status}
                      </p>
                    ) : (
                      <>
                        <Loader2 className="animate-spin w-4 h-4" />
                        <ShimmeringText
                          text={status.status}
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
                      {status.newItems} new items that needs to be scraped from
                      MFC
                    </p>
                  </div>
                  <div className="flex flex-row gap-2">
                    <Button
                      variant="outline"
                      disabled={!status.isFinished}
                      onClick={() => {
                        setCurrentStep(1);
                        setSyncOption("");
                        setStatus({
                          existingItems: 0,
                          newItems: 0,
                          isFinished: true,
                          status: "",
                        });
                      }}
                    >
                      Back to Sync Options
                    </Button>
                    <Link to="/orders">
                      <Button variant="primary" disabled={!status.isFinished}>
                        Go to Orders
                      </Button>
                    </Link>
                    <Link to="/manager">
                      <Button variant="primary" disabled={!status.isFinished}>
                        Go to Collection Manager
                      </Button>
                    </Link>
                    <Link to="/dashboard">
                      <Button variant="primary" disabled={!status.isFinished}>
                        Go to Dashboard
                      </Button>
                    </Link>
                  </div>
                </div>
              )}
            </StepperContent>
          ))}
        </StepperPanel>
      </Stepper>
    </div>
  );
}
