import type Redis from "ioredis";
import type { SyncJobStatus } from "@myakiba/schemas/sync";
import { getJobStatusChannel, parseJobStatusPayload } from "@myakiba/redis/job-status";
import { redis } from "@myakiba/redis/client";

type JobStatusSubscriptionEvent =
  | Readonly<{
      kind: "message";
      status: SyncJobStatus;
    }>
  | Readonly<{
      kind: "error";
      error: Error;
    }>;

type PendingResolver = (event: JobStatusSubscriptionEvent) => void;

type SubscriptionConsumerState = {
  readonly queue: JobStatusSubscriptionEvent[];
  resolvePending: PendingResolver | null;
};

type ChannelState = {
  readonly consumers: Map<number, SubscriptionConsumerState>;
  subscribePromise: Promise<void> | null;
  subscribed: boolean;
};

export type JobStatusSubscription = Readonly<{
  next: () => Promise<JobStatusSubscriptionEvent>;
  unsubscribe: () => Promise<void>;
}>;

const CONNECTION_CLOSED_ERROR = new Error("Job status subscriber connection closed");

const createSubscriptionConsumerState = (): SubscriptionConsumerState => ({
  queue: [],
  resolvePending: null,
});

const pushToConsumerState = (
  consumerState: SubscriptionConsumerState,
  event: JobStatusSubscriptionEvent,
): void => {
  if (consumerState.resolvePending) {
    const resolvePending = consumerState.resolvePending;
    consumerState.resolvePending = null;
    resolvePending(event);
    return;
  }

  consumerState.queue.push(event);
};

const closeConsumerState = (consumerState: SubscriptionConsumerState): void => {
  pushToConsumerState(consumerState, {
    kind: "error",
    error: CONNECTION_CLOSED_ERROR,
  });
};

const toError = (error: Error | string): Error =>
  error instanceof Error ? error : new Error(error);

class JobStatusSubscriptionRegistry {
  private subscriber: Redis | null = null;
  private readonly channels = new Map<string, ChannelState>();
  private nextConsumerId = 0;

  private readonly handleMessage = (channel: string, payload: string): void => {
    const parsedStatus = parseJobStatusPayload(payload);

    if (parsedStatus === null) {
      this.publishToChannel(channel, {
        kind: "error",
        error: new Error("Received invalid job status payload from Redis"),
      });
      return;
    }

    this.publishToChannel(channel, {
      kind: "message",
      status: parsedStatus,
    });
  };

  private readonly handleError = (error: Error): void => {
    this.failAllConsumers(error);
  };

  private readonly handleClose = (): void => {
    this.failAllConsumers(CONNECTION_CLOSED_ERROR);
  };

  private ensureSubscriber(): Redis {
    if (this.subscriber) {
      return this.subscriber;
    }

    const subscriber = redis.duplicate();
    subscriber.on("message", this.handleMessage);
    subscriber.on("error", this.handleError);
    subscriber.on("close", this.handleClose);
    this.subscriber = subscriber;

    return subscriber;
  }

  private cleanupSubscriber(): void {
    if (!this.subscriber) {
      return;
    }

    this.subscriber.off("message", this.handleMessage);
    this.subscriber.off("error", this.handleError);
    this.subscriber.off("close", this.handleClose);
    this.subscriber.disconnect();
    this.subscriber = null;
  }

  private publishToChannel(channel: string, event: JobStatusSubscriptionEvent): void {
    const channelState = this.channels.get(channel);

    if (!channelState) {
      return;
    }

    for (const consumerState of channelState.consumers.values()) {
      pushToConsumerState(consumerState, event);
    }
  }

  private failAllConsumers(error: Error): void {
    for (const channelState of this.channels.values()) {
      for (const consumerState of channelState.consumers.values()) {
        pushToConsumerState(consumerState, {
          kind: "error",
          error,
        });
      }
    }

    this.channels.clear();
    this.cleanupSubscriber();
  }

  private async ensureChannelSubscribed(
    channel: string,
    channelState: ChannelState,
  ): Promise<void> {
    if (channelState.subscribed) {
      return;
    }

    if (channelState.subscribePromise) {
      return await channelState.subscribePromise;
    }

    const subscriber = this.ensureSubscriber();
    channelState.subscribePromise = subscriber
      .subscribe(channel)
      .then(() => {
        channelState.subscribed = true;
      })
      .catch((error: Error | string) => {
        throw toError(error);
      })
      .finally(() => {
        channelState.subscribePromise = null;
      });

    await channelState.subscribePromise;
  }

  private async releaseChannel(channel: string, channelState: ChannelState): Promise<void> {
    if (channelState.subscribePromise) {
      await channelState.subscribePromise.catch(() => undefined);
    }

    if (channelState.consumers.size > 0) {
      return;
    }

    this.channels.delete(channel);

    if (channelState.subscribed) {
      await this.subscriber?.unsubscribe(channel).catch(() => undefined);
    }

    if (this.channels.size === 0) {
      this.cleanupSubscriber();
    }
  }

  async subscribe(jobId: string): Promise<JobStatusSubscription> {
    const channel = getJobStatusChannel(jobId);
    const channelState = this.channels.get(channel) ?? {
      consumers: new Map<number, SubscriptionConsumerState>(),
      subscribePromise: null,
      subscribed: false,
    };

    this.channels.set(channel, channelState);

    const consumerId = this.nextConsumerId++;
    const consumerState = createSubscriptionConsumerState();
    channelState.consumers.set(consumerId, consumerState);

    try {
      await this.ensureChannelSubscribed(channel, channelState);
    } catch (error) {
      channelState.consumers.delete(consumerId);
      await this.releaseChannel(channel, channelState);
      throw toError(error instanceof Error ? error : String(error));
    }

    return {
      next: async (): Promise<JobStatusSubscriptionEvent> => {
        const queuedEvent = consumerState.queue.shift();
        if (queuedEvent) {
          return queuedEvent;
        }

        if (consumerState.resolvePending !== null) {
          throw new Error("Concurrent next() calls are not supported");
        }

        return await new Promise<JobStatusSubscriptionEvent>((resolve) => {
          consumerState.resolvePending = resolve;
        });
      },
      unsubscribe: async (): Promise<void> => {
        closeConsumerState(consumerState);
        channelState.consumers.delete(consumerId);
        await this.releaseChannel(channel, channelState);
      },
    };
  }
}

export const jobStatusSubscriptionRegistry = new JobStatusSubscriptionRegistry();
