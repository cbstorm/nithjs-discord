import EventEmitter = require('events');
import { DiscordEventContext } from './context';

export interface IChannels {
  [channelName: string]: string;
}

export interface IDiscordAppConfig {
  discordBotToken: string;
  handlerPath?: string;
  handlerPattern?: string;
  maxLengthOfEventName?: number;
}

export interface IDiscordEventConfig {
  eventName: string;
  handlers: ((ctx: DiscordEventContext) => Promise<void>)[];
}

export interface IDiscordCronConfig {
  name: string;
  cron: string;
  handler: (ctx: IDiscordContext) => Promise<void>;
}

export interface IDiscordContext {
  GetClient(): void;
  SendTo(channelName: string, content: string, onError?: (err: Error) => void): Promise<void>;
}

export interface IDiscordEventAdapterContext<T> extends IDiscordContext {
  SetData(data: T): any;
  GetData(): T;
}

export interface IDiscordEventAdapter extends EventEmitter {}

export interface IDiscordFromEventAdapterConfig<T> {
  name: string;
  event: IDiscordEventAdapter;
  handler: (ctx: IDiscordEventAdapterContext<T>) => Promise<void>;
}
