import { debugLog } from './debug-logger';

type DirHandle = any; // FileSystemDirectoryHandle
type FileHandle = any; // FileSystemFileHandle

export class ProjectManager {
  private root: DirHandle | null = null;

  async pickProjectDirectory(): Promise<boolean> {
    try {
      // @ts-ignore
      const handle = await (window as any).showDirectoryPicker({ mode: 'readwrite' });
      this.root = handle;
      await this.ensureSubdir('assets');
      await this.ensureSubdir('scenes');
      debugLog.info('Project directory selected');
      return true;
    } catch (e) {
      debugLog.error(`Project directory not selected: ${e}`);
      return false;
    }
  }

  hasProject(): boolean { return !!this.root; }

  getRoot(): DirHandle | null { return this.root; }

  async ensureSubdir(name: string): Promise<DirHandle | null> {
    if (!this.root) return null;
    // @ts-ignore
    const dir = await this.root.getDirectoryHandle(name, { create: true });
    return dir;
  }

  async writeFileIn(subdir: string, name: string, data: Blob | string): Promise<void> {
    const dir = await this.ensureSubdir(subdir);
    if (!dir) return;
    // @ts-ignore
    const fileHandle: FileHandle = await dir.getFileHandle(name, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(data);
    await writable.close();
  }

  async listFiles(subdir: string): Promise<{ name: string, handle: FileHandle }[]> {
    const dir = await this.ensureSubdir(subdir);
    if (!dir) return [];
    const result: { name: string, handle: FileHandle }[] = [];
    // @ts-ignore
    for await (const [name, entry] of dir.entries()) {
      // @ts-ignore
      if (entry.kind === 'file') result.push({ name, handle: entry });
    }
    return result;
  }

  async readTextFrom(subdir: string, name: string): Promise<string | null> {
    const files = await this.listFiles(subdir);
    const f = files.find(x => x.name === name);
    if (!f) return null;
    const file = await f.handle.getFile();
    return await file.text();
  }
}

