import { CronJob } from 'cron';
import { Client, Events, GatewayIntentBits, Message, TextBasedChannel } from 'discord.js';
import * as path from 'path';
import { DiscordContext, DiscordEventContext } from './context';
import { IChannels, IDiscordAppConfig, IDiscordEventConfig } from './interfaces';
import { DiscordUtils, loadFileSync } from './utils';

export class DiscordApp {
  private _config: IDiscordAppConfig;
  private _client?: Client<boolean>;
  private _channels: IChannels = {};
  private _handlers: { [eventName: string]: DiscordEvent } = {};
  private _cronJobHandlers: { [jobName: string]: DiscordCronJob } = {};

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
      try {
        this._channels = await this._config.loadChannelsState().then((res) => res || {});
      } catch (error) {
        console.log(error);
      }
    }
    return this;
  }

  private _saveChannels(e: Message<boolean>) {
    const [channelId, channelName] = [e.channelId, (e.channel as any).name];
    const hashedChannelName = DiscordUtils.HashChannelName(channelName);
    if (this._channels[hashedChannelName]) {
      return;
    }
    this._channels[hashedChannelName] = channelId;
    if (this._config.saveChannelsState) {
      try {
        this._config.saveChannelsState(this._channels);
      } catch (error) {
        console.log(error);
      }
    }
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
        if (!(h instanceof DiscordEvent) && !(h instanceof DiscordCronJob)) {
          continue;
        }
        if (h instanceof DiscordEvent) {
          this._handlers[h.GetEventName()] = h;
          if (cb) {
            cb(h.GetEventName());
          }
          continue;
        }
        this._cronJobHandlers[h.GetName()] = h.SetContext((new DiscordContext(this._client!) as any)._setChannels(this._channels));
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
      const ctx = new DiscordEventContext(this._client!, e);
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
    await this._client.login(this._config.discordBotToken);
  }

  async GetChannelByName(channelName: string) {
    const channelId = this._channels[DiscordUtils.HashChannelName(channelName)];
    if (!channelId) {
      return null;
    }
    return await this._client?.channels.fetch(channelId).then((c) => c as TextBasedChannel);
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

export interface IDiscordCronConfig {
  name: string;
  cron: string;
  handler: (ctx: DiscordContext) => Promise<void>;
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
