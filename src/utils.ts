import * as fs from 'fs';
import * as path from 'path';

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
