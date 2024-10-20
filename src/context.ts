import { Client, Message, TextBasedChannel } from 'discord.js';
import { IChannels, IDiscordContext, IDiscordEventAdapterContext } from './interfaces';
import { DiscordUtils } from './utils';
import EventEmitter = require('events');

export class DiscordContext implements IDiscordContext {
  protected _client: Client<boolean>;
  private _channels: IChannels = {};
  protected _e: EventEmitter = new EventEmitter();
  constructor(client: Client<boolean>) {
    this._client = client;
  }
  GetClient() {
    return this._client;
  }
  async SendTo(channelName: string, content: string, onError?: (err: Error) => void) {
    try {
      const chan = await this._getChannelByName(channelName);
      if (!chan) {
        onError?.(new Error(`Channel with name ${channelName} not found.`));
        return;
      }
      await (chan as any)?.send(content);
    } catch (error) {
      onError?.(error as Error);
    }
  }

  private _setChannels(channels: IChannels) {
    this._channels = channels;
    return this;
  }

  private async _getChannelByName(channelName: string) {
    const channelId = this._channels[DiscordUtils.HashChannelName(channelName)];
    if (!channelId) {
      return null;
    }
    return await this._client?.channels.fetch(channelId).then((c) => c as TextBasedChannel);
  }
}

export class DiscordEventContext extends DiscordContext {
  private _eventName?: string;
  private _event: Message<boolean>;
  constructor(client: Client<boolean>, event: Message<boolean>) {
    super(client);
    this._event = event;
  }

  private _setEventName(eventName: string) {
    this._eventName = eventName;
    return this;
  }

  GetEventName() {
    return this._eventName;
  }

  GetEvent() {
    return this._event;
  }

  GetContent() {
    return this._event.content.replace(this._eventName!, '').trim();
  }

  Next() {
    this._e.emit('next');
    return;
  }
  private async _onNext() {
    return new Promise<void>((resolve, reject) => {
      return this._e.once('next', () => resolve());
    });
  }
  async Typing() {
    await (this._event.channel as any).sendTyping();
  }
  async ReplyMessage(msg: string) {
    await this._event.reply(msg);
  }
  async ReplyFile(f_path: string) {
    await this._event.reply({ files: [f_path] });
  }
}

export class DiscordEventAdapterContext<T> extends DiscordContext implements IDiscordEventAdapterContext<T> {
  private _data: T | null = null;
  SetData(data: T) {
    this._data = data;
    return this;
  }
  GetData(): T {
    return this._data as T;
  }
}
