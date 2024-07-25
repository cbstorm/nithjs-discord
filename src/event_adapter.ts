import EventEmitter = require('events');
import { IDiscordEventAdapter } from './interfaces';

export class DiscordEventAdapter<T> extends EventEmitter implements IDiscordEventAdapter {
  private _eventName!: string;

  private _setEventName(eventName: string) {
    this._eventName = eventName;
    return this;
  }
  Emit(data: T) {
    return this.emit(this._eventName, data);
  }
}
