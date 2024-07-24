import EventEmitter = require('events');
import * as fs from 'fs';
import * as path from 'path';
import { IChannels } from './interfaces';

export function loadFileSync(dir: string, filelist: string[] = [], options?: { recursive?: boolean; endWith?: string }) {
  const files = fs.readdirSync(dir);
  files.forEach((file: any) => {
    if (options?.recursive && fs.statSync(path.join(dir, file)).isDirectory()) {
      filelist = loadFileSync(path.join(dir, file), filelist, {
        recursive: true,
        endWith: options.endWith,
      });
    } else {
      filelist.push(path.join(dir, file));
    }
  });
  if (options?.endWith) {
    return filelist.filter((f) => endsWith(f, options.endWith!));
  }
  return filelist;
}

export function endsWith(str: string, pattern: string): boolean {
  if (str.length < pattern.length) return false;
  if (str.slice(-pattern.length) == pattern) {
    return true;
  }
  return false;
}

export class Debounce<T, V> {
  private time_out?: NodeJS.Timeout;
  private handler: (inp?: T) => Promise<V>;
  private time_ms: number;
  constructor(time_ms: number, handler: (inp?: T) => Promise<V>) {
    this.time_ms = time_ms;
    this.handler = handler;
  }
  async exec(inp?: T) {
    if (this.time_out) clearTimeout(this.time_out);
    return new Promise((resolve, reject) => {
      this.time_out = setTimeout(() => {
        this.handler(inp)
          .then((res) => resolve(res))
          .catch((err) => reject(err));
      }, this.time_ms);
    });
  }
}

export class DiscordUtils {
  static HashChannelName(channel_name: string) {
    return Buffer.from(channel_name, 'utf-8').toString('hex');
  }
  static DefaultSaveChannelsState(file_path: string) {
    return (channels: IChannels) => {
      fs.writeFile(
        path.join(file_path),
        Object.entries(channels)
          .map((e) => `${e[0]}=${e[1]}`)
          .join('\n'),
        (err) => {
          if (err) {
            console.log(err);
          }
        }
      );
    };
  }

  static DefaultLoadChannelsState(file_name: string) {
    return async function () {
      let state = fs.readFileSync(file_name, { encoding: 'utf-8' })?.split('\n');
      return state.reduce((a: any, b) => {
        const line = b.split('=');
        a[line[0]] = line[1];
        return a;
      }, {});
    };
  }
}
