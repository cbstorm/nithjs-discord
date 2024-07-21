import { Client, Events, GatewayIntentBits, Message } from 'discord.js';
import * as path from 'path';
import { DiscordContext } from './context';
import { loadFileSync } from './utils';

export interface IDiscordAppConfig {
  discordBotToken: string;
  handlerPath?: string;
  handlerPattern?: string;
  maxLengthOfEventName?: number;
}

export class DiscordApp {
  private _config: IDiscordAppConfig;
  private _client?: Client<boolean>;
  private _channels: { name: string; id: string }[] = [];
  private _handlers: { [eventName: string]: DiscordEvent } = {};

  constructor(config: IDiscordAppConfig) {
    this._config = {
      discordBotToken: config.discordBotToken,
      handlerPath: config.handlerPath || path.join(process.cwd(), 'src', 'modules'),
      handlerPattern: config.handlerPattern || '.discord_handler.js',
      maxLengthOfEventName: config.maxLengthOfEventName || 20,
    };
  }

  Init() {
    if (!this._config.discordBotToken) {
      throw new Error("Discord Bot token is required. Let's check the config again!");
    }
    this._client = new Client({
      intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers],
    });
    return this;
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
      if (!handlers?.length) {
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
  }
  private _listenEvent() {
    if (!this._client) {
      throw new Error("The app have not initialized. Let's call Init() first!");
    }
    this._client.on('messageCreate', async (e: Message<boolean>) => {
      if (e.author.bot) return;
      if (!e.content) return;
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
        await ctx.ReplyMessage(error?.message || 'Error occurred');
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
    await this._client.login(this._config.discordBotToken);
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
