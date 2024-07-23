import { Client, Events, GatewayIntentBits, Message, TextBasedChannel } from 'discord.js';
import * as path from 'path';
import { DiscordContext } from './context';
import { loadFileSync } from './utils';

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

export class DiscordApp {
  private _config: IDiscordAppConfig;
  private _client?: Client<boolean>;
  private _channels: IChannels = {};
  private _handlers: { [eventName: string]: DiscordEvent } = {};

  constructor(config: IDiscordAppConfig) {
    this._config = {
      discordBotToken: config.discordBotToken,
      handlerPath: config.handlerPath || path.join(process.cwd(), 'src', 'modules'),
      handlerPattern: config.handlerPattern || '.discord_handler.js',
      maxLengthOfEventName: config.maxLengthOfEventName || 20,
      saveChannelsState: config.saveChannelsState,
      loadChannelsState: config.loadChannelsState,
    };
  }

  async Init() {
    if (!this._config.discordBotToken) {
      throw new Error("Discord Bot token is required. Let's check the config again!");
    }
    this._client = new Client({
      intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers],
    });
    if (this._config.loadChannelsState) {
      this._channels = await this._config.loadChannelsState();
    }
    return this;
  }

  private _saveChannels(e: Message<boolean>) {
    const [channelId, channelName] = [e.channelId, (e.channel as any).name];
    const hashedChannelName = this._hashChannelName(channelName);
    if (this._channels[hashedChannelName]) {
      return;
    }
    this._channels[hashedChannelName] = channelId;
    if (this._config.saveChannelsState) {
      this._config.saveChannelsState(this._channels);
    }
  }
  private _hashChannelName(channel_name: string) {
    return Buffer.from(channel_name, 'utf-8').toString('hex');
  }

  LoadHandler(cb?: (eventName: string) => void) {
    const p = this._config.handlerPath!;
    const handler_files = loadFileSync(p, [], {
      recursive: true,
      endWith: this._config.handlerPattern,
    });
    if (handler_files.length == 0) {
      return this;
    }
    for (const f of handler_files) {
      const handlers = require(f);
      if (!Object.values(handlers)?.length) {
        continue;
      }
      for (const h of Object.values(handlers)) {
        if (!(h instanceof DiscordEvent)) {
          continue;
        }
        this._handlers[h.GetEventName()] = h;
        if (cb) {
          cb(h.GetEventName());
        }
      }
    }
    return this;
  }
  private _listenEvents() {
    if (!this._client) {
      throw new Error("The app have not initialized. Let's call Init() first!");
    }
    this._client.on('messageCreate', async (e: Message<boolean>) => {
      if (e.author.bot) return;
      if (!e.content) return;
      this._saveChannels(e);
      const eventName = e.content
        .slice(0, this._config.maxLengthOfEventName! + 1)
        .split(' ')
        .map((e) => e.trim())[0];
      const handlers = this._handlers[eventName]?.GetHandlers();
      if (!handlers?.length) return;
      const ctx = new DiscordContext(this._client!, e);
      try {
        for (const h of handlers) {
          await new Promise<void>((resolve, reject) => {
            (ctx as any)._onNext().then(() => resolve());
            h(ctx)
              .then(() => resolve())
              .catch((error) => reject(error));
          });
        }
      } catch (error: any) {
        await ctx.ReplyMessage(error?.message || 'Error occurred').catch((err) => {
          console.log(err);
        });
        return;
      }
    });
  }
  async Listen(cb: (readyClient: Client<true>) => void) {
    if (!this._client) {
      throw new Error("The app have not initialized. Let's call Init() first!");
    }
    this._client.once(Events.ClientReady, (readyClient) => {
      cb(readyClient);
    });
    this._listenEvents();
    await this._client.login(this._config.discordBotToken);
  }

  async GetChannelByName(channelName: string) {
    const channelId = this._channels[this._hashChannelName(channelName)];
    if (!channelId) {
      return null;
    }
    return await this._client?.channels.fetch(channelId).then((c) => c as TextBasedChannel);
  }
}

export interface IDiscordEvent {
  eventName: string;
  handlers: ((ctx: DiscordContext) => Promise<void>)[];
}
export class DiscordEvent {
  private _eventName: string;
  private _handlers: ((ctx: DiscordContext) => Promise<void>)[];
  constructor(e: IDiscordEvent) {
    this._eventName = e.eventName;
    this._handlers = e.handlers;
  }
  GetEventName() {
    return this._eventName;
  }
  GetHandlers() {
    return this._handlers;
  }
}
