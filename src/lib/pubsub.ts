import { createClient } from "../db/redis";

export class PubSub {
  pub = createClient();
  sub = createClient();
  _channels = new Set<string>();
  _subscribers = new Set<(inChannel: string, message: string) => void>();
  constructor() {
    this.sub.on("message", (channel, message) => {
      this._subscribers.forEach((pValueFn) => pValueFn(channel, message));
    });
  }
  publish(channel: string, message: Record<string, any>) {
    this.pub.publish(channel, JSON.stringify(message));
  }
  on<T = any>(
    channel: string,
    filterFn?: (payload: T) => boolean
  ): AsyncIterableIterator<T | undefined> {
    const pullQueue: ((value?: any) => void)[] = [];
    const pushQueue: T[] = [];
    let listening = true;

    // Only subscribe to channel if not already
    // We don't have a lot of channels and likely
    // all are subscribed at one point so we do
    // not need to unsubscribe
    if (!this._channels.has(channel)) {
      this.sub.subscribe(channel);
      this._channels.add(channel);
    }

    const pushValue = (inChannel: string, message: string) => {
      if (inChannel !== channel) return;
      const value: T = JSON.parse(message);
      if (filterFn?.(value) === false) return;
      if (pullQueue.length > 0) {
        pullQueue.shift()!({ value, done: false });
      } else {
        pushQueue.push(value);
      }
    };

    this._subscribers.add(pushValue);

    const emptyQueue = () => {
      listening = false;
      this._subscribers.delete(pushValue);
      for (const resolve of pullQueue) {
        resolve({ value: undefined, done: true });
      }
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
  }
}

export const pubsub = new PubSub();
