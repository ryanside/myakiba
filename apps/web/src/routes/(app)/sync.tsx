import { createFileRoute, Link } from "@tanstack/react-router";
import { useForm } from "@tanstack/react-form";
import Papa from "papaparse";
import { client } from "@/lib/hono-client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
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
import {
  BookImage,
  Check,
  Loader2,
  LoaderCircleIcon,
  ShoppingCart,
  Upload,
} from "lucide-react";
import { tryCatch } from "@/lib/utils";
import { ShimmeringText } from "@/components/ui/shimmering-text";
import { transformCSVData } from "@/lib/sync/utils";
import { csvSchema, type userItem, type status } from "@/lib/sync/types";
import { toast } from "sonner";

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

  const orderForm = useForm({
    defaultValues: {},
    onSubmit: async ({ value }) => {
      console.log(value);
    },
  });

  const collectionForm = useForm({
    defaultValues: {},
    onSubmit: async ({ value }) => {
      console.log(value);
    },
  });

  const csvForm = useForm({
    defaultValues: {
      file: undefined as File | undefined,
    },
    onSubmit: async ({ value }) => {
      const { data: userItems, error: transformCSVDataError } = await tryCatch(
        transformCSVData(value)
      );
      if (transformCSVDataError) {
        console.error("Error transforming CSV data", transformCSVDataError);
        return transformCSVDataError instanceof Error
          ? transformCSVDataError.message
          : "An error occurred";
      }

      const data = await mutation.mutateAsync(userItems);

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

      csvForm.reset();
    },
  });

  async function getJobStatus(jobId: string) {
    const response = await client.api.sync.sse.$get({
      query: {
        jobId: jobId,
      },
    });
    if (!response.ok) {
      throw new Error("Failed to get job status");
    }
    return response.json();
  }

  const mutation = useMutation({
    mutationFn: (userItems: userItem[]) => sendItems(userItems),
    onError: (error) => {
      toast.error("Failed to submit CSV. Please try again.", {
        description: `Error: ${error.message}`,
      });
    },
  });

  async function sendItems(userItems: userItem[]) {
    const response = await client.api.sync.csv.$post({
      json: userItems,
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || `HTTP ${response.status}`);
    }
    return response.json();
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
                <div className="rounded-lg border p-4 space-y-4 w-full">
                  <Label className="text-lg text-foreground">
                    Choose a sync option
                  </Label>
                  <div className="flex flex-col gap-4 justify-center">
                    <div
                      className="rounded-md border p-4 shadow-sm space-y-2 hover:bg-muted"
                      onClick={() => {
                        handleSyncOption("csv");
                      }}
                    >
                      <Label className="text-md text-foreground">
                        <Upload className="w-4 h-4" /> Upload MyFigureCollection
                        CSV
                        <span className="text-xs text-bold text-primary">
                          (Recommended for onboarding)
                        </span>
                      </Label>
                      <div className="">
                        <p className="text-sm text-pretty">
                          {`This option allows you to import your items from a
                          MyFigureCollection CSV file.`}
                        </p>
                        <p className="text-sm text-pretty font-light italic tracking-tight">
                          {`You can export your MyFigureCollection
                          CSV by going to https://myfigurecollection.net > User Menu > Manager > CSV Export.`}
                        </p>
                      </div>
                    </div>
                    <div
                      className="rounded-md border p-4 shadow-sm space-y-2 hover:bg-muted"
                      onClick={() => {
                        handleSyncOption("order");
                      }}
                    >
                      <Label className="text-md text-foreground">
                        <ShoppingCart className="w-4 h-4" /> Add Order using
                        MyFigureCollection Item IDs
                      </Label>
                      <div>
                        <p className="text-sm text-pretty">
                          {`This option allows you to create an order and add order items to it using MyFigureCollection Item IDs.`}
                        </p>
                      </div>
                    </div>
                    <div
                      className="rounded-md border p-4 shadow-sm space-y-2 hover:bg-muted"
                      onClick={() => {
                        handleSyncOption("collection");
                      }}
                    >
                      <Label className="text-md text-foreground">
                        <BookImage className="w-4 h-4" /> Add Collection Items
                        using MyFigureCollection Item IDs
                      </Label>
                      <div>
                        <p className="text-sm text-pretty">
                          {`This option allows you to add to your collection using MyFigureCollection Item IDs.`}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              {index === 1 && syncOption === "order" && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    void orderForm.handleSubmit();
                  }}
                  className="rounded-lg border p-4 space-y-4 w-full"
                >
                  <Button variant="outline" onClick={() => setCurrentStep(1)}>
                    Back to Sync Options
                  </Button>
                </form>
              )}
              {index === 1 && syncOption === "collection" && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    void collectionForm.handleSubmit();
                  }}
                  className="rounded-lg border p-4 space-y-4 w-full"
                >
                  <Button variant="outline" onClick={() => setCurrentStep(1)}>
                    Back to Sync Options
                  </Button>
                </form>
              )}
              {index === 1 && syncOption === "csv" && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    void csvForm.handleSubmit();
                  }}
                  className="rounded-lg border p-4 space-y-4 w-full"
                >
                  <csvForm.Field
                    name="file"
                    validators={{
                      onSubmitAsync: async ({ value }) => {
                        if (!value) {
                          return "No file selected";
                        }

                        const text = await value.text();
                        const parsedCSV = Papa.parse(text, {
                          header: true,
                          skipEmptyLines: true,
                          transformHeader: (header: string) =>
                            header.trim().toLowerCase().replace(/ /g, "_"),
                        });

                        const validatedCSV = csvSchema.safeParse(
                          parsedCSV.data
                        );
                        if (!validatedCSV.success) {
                          console.log("Invalid CSV file", validatedCSV.error);
                          return "Please select a valid MyFigureCollection CSV file";
                        }

                        const filteredData = validatedCSV.data.filter(
                          (item) => {
                            return (
                              (item.status === "Owned" ||
                                item.status === "Ordered") &&
                              !item.title.startsWith("[NSFW")
                            );
                          }
                        );
                        if (filteredData.length === 0) {
                          return "No Owned or Ordered items to sync";
                        }
                      },
                    }}
                    children={(field) => {
                      return (
                        <div className="space-y-4">
                          <Label
                            htmlFor="csv-file"
                            className="text-foreground text-lg"
                          >
                            Select MyFigureCollection CSV File
                          </Label>
                          <Input
                            id="csv-file"
                            type="file"
                            accept=".csv,text/csv"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              field.handleChange(file);
                            }}
                            className="h-48 outline-dashed outline-2 outline-muted-foreground p-2"
                          />
                          {!field.state.meta.isValid && (
                            <em role="alert" className="text-red-500">
                              {field.state.meta.errors.join(", ")}
                            </em>
                          )}
                        </div>
                      );
                    }}
                  />
                  <div className="flex justify-start gap-2">
                    <Button variant="outline" onClick={() => setCurrentStep(1)}>
                      Back to Sync Options
                    </Button>
                    <csvForm.Subscribe
                      selector={(state) => [
                        state.canSubmit,
                        state.isSubmitting,
                      ]}
                      children={([canSubmit, isSubmitting]) => (
                        <Button
                          type="submit"
                          disabled={!canSubmit}
                          variant="primary"
                        >
                          {isSubmitting ? "Submitting..." : "Submit"}
                        </Button>
                      )}
                    />
                  </div>
                </form>
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
