import { panic } from "better-result";
import type Redis from "ioredis";
import type { SyncJobStatus } from "@myakiba/contracts/sync/schema";
import { getJobStatusChannel, parseJobStatusPayload } from "@myakiba/redis/job-status";
import { logConnectionError } from "@myakiba/redis/log-connection-error";
import { redis } from "@myakiba/redis/client";
import { JobStatusSubscriptionLost } from "@/lib/errors/job-status-subscription-lost";

type JobStatusSubscriptionEvent =
  | Readonly<{
      kind: "message";
      status: SyncJobStatus;
    }>
  | Readonly<{
      kind: "error";
      error: JobStatusSubscriptionLost;
    }>;

type PendingResolver = (event: JobStatusSubscriptionEvent) => void;

type SubscriptionConsumerState = {
  pendingEvent: JobStatusSubscriptionEvent | null;
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

  const pendingEvent = consumerState.pendingEvent;
  if (
    pendingEvent?.kind === "error" ||
    (pendingEvent?.kind === "message" && pendingEvent.status.terminalState !== null)
  ) {
    return;
  }

  consumerState.pendingEvent = event;
};

const closeConsumerState = (consumerState: SubscriptionConsumerState): void => {
  pushToConsumerState(consumerState, {
    kind: "error",
    error: new JobStatusSubscriptionLost({ reason: "closed" }),
  });
};

const toError = (cause: unknown): Error =>
  cause instanceof Error ? cause : new Error(String(cause));

class JobStatusSubscriptionRegistry {
  private subscriber: Redis | null = null;
  private readonly channels = new Map<string, ChannelState>();
  private nextConsumerId = 0;

  private readonly handleMessage = (channel: string, payload: string): void => {
    const parsedStatus = parseJobStatusPayload(payload);

    if (parsedStatus.isErr()) {
      this.publishToChannel(channel, {
        kind: "error",
        error: new JobStatusSubscriptionLost({ reason: "invalid_payload" }),
      });
      return;
    }

    this.publishToChannel(channel, {
      kind: "message",
      status: parsedStatus.value,
    });
  };

  private readonly handleError = (error: Error): void => {
    logConnectionError(error);
    this.failAllConsumers(new JobStatusSubscriptionLost({ reason: "redis_error", cause: error }));
  };

  private readonly handleClose = (): void => {
    this.failAllConsumers(new JobStatusSubscriptionLost({ reason: "closed" }));
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

  private failAllConsumers(error: JobStatusSubscriptionLost): void {
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
    const subscribePromise = (async (): Promise<void> => {
      try {
        await subscriber.subscribe(channel);
        channelState.subscribed = true;
      } catch (error) {
        throw toError(error);
      } finally {
        channelState.subscribePromise = null;
      }
    })();
    channelState.subscribePromise = subscribePromise;

    await subscribePromise;
  }

  private async releaseChannel(channel: string, channelState: ChannelState): Promise<void> {
    if (channelState.subscribePromise) {
      await channelState.subscribePromise.catch(() => {});
    }

    if (channelState.consumers.size > 0) {
      return;
    }

    this.channels.delete(channel);

    if (channelState.subscribed) {
      await this.subscriber?.unsubscribe(channel).catch(() => {});
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
    const consumerState: SubscriptionConsumerState = {
      pendingEvent: null,
      resolvePending: null,
    };
    channelState.consumers.set(consumerId, consumerState);

    try {
      await this.ensureChannelSubscribed(channel, channelState);
    } catch (error) {
      channelState.consumers.delete(consumerId);
      await this.releaseChannel(channel, channelState);
      throw toError(error);
    }

    return {
      next: async (): Promise<JobStatusSubscriptionEvent> => {
        if (consumerState.pendingEvent) {
          const pendingEvent = consumerState.pendingEvent;
          consumerState.pendingEvent = null;
          return pendingEvent;
        }

        if (consumerState.resolvePending !== null) {
          panic("A job-status subscription's next() was called while an earlier call still waits");
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
