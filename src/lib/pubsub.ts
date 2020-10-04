import { createClient } from "../db/redis";

export const pubsub = {
  pub: createClient(),
  sub: createClient(),
  _pubsubOnSubChannels: new Set(),
  publish(channel: string, message: Record<string, any>) {
    this.pub.publish(channel, JSON.stringify(message));
  },
  on<T = any>(
    channel: string,
    filterFn?: (payload: T) => boolean
  ): AsyncIterableIterator<any> {
    const pullQueue: ((value?: any) => void)[] = [];
    const pushQueue: T[] = [];
    let listening = true;

    // Only subscribe to channel if not already
    // We don't have a lot of channels and likely
    // all are subscribed at one point so we do
    // not need to unsubscribe
    if (!this._pubsubOnSubChannels.has(channel)) {
      this.sub.subscribe(channel);
      this._pubsubOnSubChannels.add(channel);
    }

    function pushValue(inChannel: string, message: string) {
      if (inChannel !== channel) return;
      const value: T = JSON.parse(message);
      if (filterFn?.(value) === false) return;
      if (pullQueue.length > 0) {
        pullQueue.shift()!({ value, done: false });
      } else {
        pushQueue.push(value);
      }
    }

    this.sub.on("message", pushValue);
    const emptyQueue = () => {
      listening = false;
      this.sub.off("message", pushValue);
      pullQueue.length = 0;
      pushQueue.length = 0;
    };

    return {
      next() {
        if (!listening) {
          return Promise.resolve({ value: undefined, done: true });
        }
        if (pushQueue.length > 0) {
          return Promise.resolve({ value: pushQueue.shift(), done: false });
        }
        return new Promise((resolve) => pullQueue.push(resolve));
      },
      return() {
        emptyQueue();
        return Promise.resolve({ value: undefined, done: true });
      },
      throw(error) {
        emptyQueue();
        return Promise.reject(error);
      },
      [Symbol.asyncIterator]() {
        return this;
      },
    };
  },
};

export type PubSub = typeof pubsub;
