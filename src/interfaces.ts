import { DiscordEventContext } from './context';

export interface IChannels {
  [channelName: string]: string;
}

export interface IDiscordAppConfig {
  discordBotToken: string;
  handlerPath?: string;
  handlerPattern?: string;
  maxLengthOfEventName?: number;
  saveChannelsState?: (channels: IChannels) => void;
  loadChannelsState?: () => Promise<IChannels>;
}

export interface IDiscordEventConfig {
  eventName: string;
  handlers: ((ctx: DiscordEventContext) => Promise<void>)[];
}
