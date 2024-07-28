import { CronJob } from 'cron';
import { ChannelManager, Client, codeBlock, Events, GatewayIntentBits, Message, TextBasedChannel, TextChannel } from 'discord.js';
import * as path from 'path';
import { DiscordContext, DiscordEventAdapterContext, DiscordEventContext } from './context';
import {
  IChannels,
  IDiscordAppConfig,
  IDiscordCronConfig,
  IDiscordEventAdapter,
  IDiscordEventAdapterContext,
  IDiscordEventConfig,
  IDiscordFromEventAdapterConfig,
} from './interfaces';
import { DiscordUtils, loadFileSync } from './utils';

export class DiscordApp {
  private _config: IDiscordAppConfig;
  private _client?: Client<boolean>;
  private _channels: IChannels = {};
  private _handlers: { [eventName: string]: DiscordEvent } = {};
  private _cronJobHandlers: { [jobName: string]: DiscordCronJob } = {};
  private _stats: { startAt?: Date } = {};

  constructor(config: IDiscordAppConfig) {
    this._config = {
      discordBotToken: config.discordBotToken,
      handlerPath: config.handlerPath || path.join(process.cwd(), 'src', 'modules'),
      handlerPattern: config.handlerPattern || '.discord_handler.js',
    };
  }

  async Init() {
    if (!this._config.discordBotToken) {
      throw new Error("Discord Bot token is required. Let's check the config again!");
    }
    this._client = new Client({
      intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers],
    });
    return this;
  }

  private _saveChannels(chan: TextBasedChannel) {
    const [channelId, channelName] = [chan.id, (chan as any).name];
    const hashedChannelName = DiscordUtils.HashChannelName(channelName);
    if (this._channels[hashedChannelName]) {
      return;
    }
    this._channels[hashedChannelName] = channelId;
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
        if (!(h instanceof DiscordEvent) && !(h instanceof DiscordCronJob) && !(h instanceof DiscordFromEventAdapter)) {
          continue;
        }
        if (h instanceof DiscordEvent) {
          this._handlers[h.GetEventName()] = h;
          if (cb) {
            cb(h.GetEventName());
          }
          continue;
        }
        if (h instanceof DiscordCronJob) {
          this._cronJobHandlers[h.GetName()] = h.SetContext((new DiscordContext(this._client!) as any)._setChannels(this._channels));
          continue;
        }
        h.SetContext((new DiscordEventAdapterContext(this._client!) as any)._setChannels(this._channels));
      }
    }
    return this;
  }
  private _listenEvents() {
    if (!this._client) {
      throw new Error("The app have not initialized. Let's call Init() first!");
    }
    this._client.on('channelDelete', (chan) => {
      this._assertChannels(chan.client.channels);
    });
    this._client.on('channelUpdate', (chan) => {
      this._assertChannels(chan.client.channels);
    });
    this._client.on('channelCreate', (chan) => {
      this._assertChannels(chan.client.channels);
    });
    this._client.on('messageCreate', async (e: Message<boolean>) => {
      if (e.author.bot) return;
      if (!e.content) return;
      e.content = e.content + ' ';
      this._saveChannels(e.channel);
      const eventName = e.content.slice(0, e.content.indexOf(' '));
      const handlers = this._handlers[eventName]?.GetHandlers();
      if (!handlers?.length) {
        if (eventName == '!help') {
          return this._handleHelpCommand(e);
        }
        if (eventName == '!stats') {
          return this._handleStatCommand(e);
        }
        return;
      }
      const ctx = new DiscordEventContext(this._client!, e);
      (ctx as any)._setEventName(eventName);
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

  StartCronJobs(cb?: (jobName: string) => void) {
    const jobs = Object.values(this._cronJobHandlers);
    if (jobs.length <= 0) {
      return;
    }
    for (const j of jobs) {
      j.StartJob();
      if (cb) {
        cb(j.GetName());
      }
    }
  }

  async Listen(cb: (readyClient: Client<true>) => void) {
    if (!this._client) {
      throw new Error("The app have not initialized. Let's call Init() first!");
    }
    this._client.once(Events.ClientReady, (readyClient) => {
      cb(readyClient);
    });
    this._listenEvents();
    this._client.on('ready', (c) => {
      this._assertChannels(c.channels);
      this._stats.startAt = new Date();
    });
    await this._client.login(this._config.discordBotToken);
  }

  private _assertChannels(chans: ChannelManager) {
    const entries = chans.cache.entries();
    let done = false;
    this._channels = {};
    do {
      const e = entries.next();
      done = e.done || false;
      if (e.value?.[1] instanceof TextChannel) {
        const hashedChannelName = DiscordUtils.HashChannelName((e.value?.[1] as any)?.name);
        this._channels[hashedChannelName] = e.value?.[0];
      }
    } while (!done);
  }

  async GetChannelByName(channelName: string) {
    const channelId = this._channels[DiscordUtils.HashChannelName(channelName)];
    if (!channelId) {
      return null;
    }
    return await this._client?.channels.fetch(channelId).then((c) => c as TextBasedChannel);
  }

  private async _handleHelpCommand(e: Message<boolean>) {
    let content = '';
    for (const h of Object.keys(this._handlers)) {
      content = content.concat(`${h}\n`);
    }
    await e.reply(codeBlock(content));
  }

  private async _handleStatCommand(e: Message<boolean>) {
    let content = '';
    for (const e of Object.entries(this._stats)) {
      content = content.concat(`${e[0]}: ${e[1]}\n`);
    }
    await e.reply(codeBlock(content));
  }
}

export class DiscordEvent {
  private _eventName: string;
  private _handlers: ((ctx: DiscordEventContext) => Promise<void>)[];
  constructor(e: IDiscordEventConfig) {
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

export class DiscordCronJob {
  private _name: string;
  private _job: CronJob;
  private _ctx?: DiscordContext;
  constructor(config: IDiscordCronConfig) {
    this._name = config.name;
    this._job = CronJob.from({
      cronTime: config.cron,
      onTick: async () => {
        await config.handler(this._ctx!);
      },
      start: false,
      timeZone: 'Asia/Ho_Chi_Minh',
    });
  }
  GetName() {
    return this._name;
  }
  GetJob() {
    return this._job;
  }
  StartJob() {
    this._job.start();
    return;
  }
  SetContext(ctx: DiscordContext) {
    this._ctx = ctx;
    return this;
  }
}

export class DiscordFromEventAdapter<T> {
  private _name: string;
  private _handler: (ctx: IDiscordEventAdapterContext<T>) => Promise<void>;
  private _event: IDiscordEventAdapter;
  private _ctx?: IDiscordEventAdapterContext<T>;
  constructor(config: IDiscordFromEventAdapterConfig<T>) {
    this._name = config.name;
    this._handler = config.handler;
    this._event = (config.event as any)._setEventName(this._name);
    this._event.on(this._name, (data: T) => {
      this._handler(this._ctx?.SetData(data));
    });
  }
  GetName() {
    return this._name;
  }
  GetAdapter() {
    return this._event;
  }
  GetHandler() {
    return this._handler;
  }
  SetContext(ctx: IDiscordEventAdapterContext<T>) {
    this._ctx = ctx;
  }
}
