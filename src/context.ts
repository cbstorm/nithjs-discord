import { Client, Message } from 'discord.js';
import EventEmitter = require('events');

export class DiscordContext {
  private _client: Client<boolean>;
  private _event: Message<boolean>;
  private _e: EventEmitter = new EventEmitter();
  constructor(client: Client<boolean>, event: Message<boolean>) {
    this._client = client;
    this._event = event;
  }
  IsBot() {
    return this._event.author.bot;
  }
  GetEvent() {
    return this._event;
  }
  GetClient() {
    return this._client;
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
  async ReplyMessage(msg: string) {
    await this._event.reply(msg);
  }
}
