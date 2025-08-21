import { Mesh } from './geometry/mesh';

type Entry = { mesh: Mesh; refs: number };

export class MeshRegistry {
  private static entries: Map<string, Entry> = new Map();

  static get(gl: WebGL2RenderingContext, id: string, create: () => Mesh): Mesh {
    let e = this.entries.get(id);
    if (!e) {
      e = { mesh: create(), refs: 0 };
      this.entries.set(id, e);
    }
    e.refs++;
    return e.mesh;
  }

  static addRef(id: string) {
    const e = this.entries.get(id);
    if (e) e.refs++;
  }

  static release(id: string) {
    const e = this.entries.get(id);
    if (!e) return;
    e.refs--;
    if (e.refs <= 0) {
      // Optional: add cleanup of GL resources if needed
      this.entries.delete(id);
    }
  }

  static getRefCount(id: string): number {
    const e = this.entries.get(id);
    return e ? e.refs : 0;
  }
}

