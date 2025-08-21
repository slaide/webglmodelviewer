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

  private async getDirForPath(subdir: string, relDirPath: string, create: boolean): Promise<DirHandle | null> {
    let dir = await this.ensureSubdir(subdir);
    if (!dir) return null;
    if (!relDirPath) return dir;
    const parts = relDirPath.split('/').filter(Boolean);
    for (const p of parts) {
      // @ts-ignore
      dir = await dir.getDirectoryHandle(p, { create });
    }
    return dir;
  }

  async ensureDirPath(subdir: string, relDirPath: string): Promise<DirHandle | null> {
    return await this.getDirForPath(subdir, relDirPath, true);
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

  async writeFileAt(subdir: string, relPath: string, data: Blob | string): Promise<void> {
    const parts = relPath.split('/').filter(Boolean);
    const dirPath = parts.slice(0, -1).join('/');
    const fileName = parts[parts.length - 1];
    const dir = await this.getDirForPath(subdir, dirPath, true);
    if (!dir) return;
    // @ts-ignore
    const fileHandle: FileHandle = await dir.getFileHandle(fileName, { create: true });
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

  async listEntries(subdir: string): Promise<{ name: string, kind: 'file'|'directory', handle: any }[]> {
    const dir = await this.ensureSubdir(subdir);
    if (!dir) return [];
    const result: { name: string, kind: 'file'|'directory', handle: any }[] = [];
    // @ts-ignore
    for await (const [name, entry] of dir.entries()) {
      // @ts-ignore
      result.push({ name, kind: entry.kind, handle: entry });
    }
    return result;
  }

  async listEntriesAt(subdir: string, relDirPath: string): Promise<{ name: string, kind: 'file'|'directory', handle: any }[]> {
    let dir = await this.ensureSubdir(subdir);
    if (!dir) return [];
    const parts = relDirPath.split('/').filter(Boolean);
    for (const p of parts) {
      // @ts-ignore
      dir = await dir.getDirectoryHandle(p, { create: false });
    }
    const result: { name: string, kind: 'file'|'directory', handle: any }[] = [];
    // @ts-ignore
    for await (const [name, entry] of dir.entries()) {
      // @ts-ignore
      result.push({ name, kind: entry.kind, handle: entry });
    }
    return result;
  }

  async listFilesRecursive(subdir: string): Promise<{ path: string, handle: FileHandle }[]> {
    const out: { path: string, handle: FileHandle }[] = [];
    const walk = async (dir: any, prefix: string) => {
      // @ts-ignore
      for await (const [name, entry] of dir.entries()) {
        // @ts-ignore
        if (entry.kind === 'file') {
          out.push({ path: prefix ? `${prefix}/${name}` : name, handle: entry });
        } else {
          await walk(entry, prefix ? `${prefix}/${name}` : name);
        }
      }
    };
    const dir = await this.ensureSubdir(subdir);
    if (dir) await walk(dir, '');
    return out;
  }

  async deleteFileAt(subdir: string, relPath: string): Promise<void> {
    const parts = relPath.split('/').filter(Boolean);
    let dir = await this.ensureSubdir(subdir);
    if (!dir) return;
    for (let i = 0; i < parts.length - 1; i++) {
      // @ts-ignore
      dir = await dir.getDirectoryHandle(parts[i], { create: false });
    }
    const name = parts[parts.length - 1];
    // @ts-ignore
    await dir.removeEntry(name, { recursive: false });
  }

  async deleteFolderAt(subdir: string, relDirPath: string, recursive: boolean = true): Promise<void> {
    let dir = await this.ensureSubdir(subdir);
    if (!dir) return;
    const parts = relDirPath.split('/').filter(Boolean);
    if (parts.length === 0) return;
    for (let i = 0; i < parts.length - 1; i++) {
      // @ts-ignore
      dir = await dir.getDirectoryHandle(parts[i], { create: false });
    }
    const name = parts[parts.length - 1];
    // @ts-ignore
    await dir.removeEntry(name, { recursive });
  }

  async readTextFrom(subdir: string, name: string): Promise<string | null> {
    const files = await this.listFiles(subdir);
    const f = files.find(x => x.name === name);
    if (!f) return null;
    const file = await f.handle.getFile();
    return await file.text();
  }

  async readTextAt(subdir: string, relPath: string): Promise<string | null> {
    const parts = relPath.split('/').filter(Boolean);
    let dir = await this.ensureSubdir(subdir);
    if (!dir) return null;
    for (let i = 0; i < parts.length - 1; i++) {
      // @ts-ignore
      dir = await dir.getDirectoryHandle(parts[i], { create: false });
    }
    const name = parts[parts.length - 1];
    // @ts-ignore
    const fileHandle: FileHandle = await dir.getFileHandle(name, { create: false });
    const file = await fileHandle.getFile();
    return await file.text();
  }

  async readFileAt(subdir: string, relPath: string): Promise<Blob | null> {
    const parts = relPath.split('/').filter(Boolean);
    let dir = await this.ensureSubdir(subdir);
    if (!dir) return null;
    for (let i = 0; i < parts.length - 1; i++) {
      // @ts-ignore
      dir = await dir.getDirectoryHandle(parts[i], { create: false });
    }
    const name = parts[parts.length - 1];
    // @ts-ignore
    const fileHandle: FileHandle = await dir.getFileHandle(name, { create: false });
    const file = await fileHandle.getFile();
    return file;
  }

  async moveFile(subdir: string, fromRelPath: string, toRelPath: string): Promise<void> {
    const file = await this.readFileAt(subdir, fromRelPath);
    if (!file) return;
    await this.writeFileAt(subdir, toRelPath, file);
    await this.deleteFileAt(subdir, fromRelPath);
  }

  async writeJSON(subdir: string, name: string, obj: any): Promise<void> {
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
    await this.writeFileIn(subdir, name, blob);
  }

  async readJSON(subdir: string, name: string): Promise<any | null> {
    const txt = await this.readTextFrom(subdir, name);
    if (txt == null) return null;
    try { return JSON.parse(txt); } catch { return null; }
  }
}
