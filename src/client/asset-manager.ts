import { WebGLRenderer } from './renderer';
import { SceneNode } from './scene-node';
import { SceneObject } from './scene-object';
import { Drawable } from './drawable';
import { Mesh } from './geometry/mesh';
import { ProjectManager } from './project-manager';
import { vec3 } from 'gl-matrix';
import { debugLog } from './debug-logger';
import { parseOBJ, parseMTL } from './parsers/obj-mtl';

export type AssetType = 'mesh';

export interface Asset {
  id: string;
  name: string;
  type: AssetType;
  // For meshes
  positions?: Float32Array;
  normals?: Float32Array;
  material?: {
    color?: [number, number, number];
    ambient?: number;
    diffuse?: number;
    specular?: number;
    shininess?: number;
  };
}

export class AssetManager {
  private assets = new Map<string, Asset>();
  private container: HTMLElement;
  private gl: WebGL2RenderingContext;

  constructor(private renderer: WebGLRenderer, private project?: ProjectManager) {
    this.gl = renderer.getGLContext();
    const container = document.getElementById('assets-content');
    if (!container) throw new Error('Assets container not found');
    this.container = container;
    this.setupDnD();
  }

  setProject(project: ProjectManager) {
    this.project = project;
  }

  list(): Asset[] { return Array.from(this.assets.values()); }

  private setupDnD() {
    const dropZone = document.getElementById('assets-drop-zone') as HTMLElement;
    const fileInput = document.getElementById('assets-file-input') as HTMLInputElement | null;
    if (!dropZone) return;
    dropZone.ondragover = (e) => { e.preventDefault(); dropZone.classList.add('hover'); };
    dropZone.ondragleave = () => dropZone.classList.remove('hover');
    dropZone.ondrop = async (e) => {
      e.preventDefault();
      dropZone.classList.remove('hover');
      let files: File[] = Array.from(e.dataTransfer?.files || []);
      // Fallback: some browsers require using DataTransferItemList
      if (files.length === 0 && e.dataTransfer?.items) {
        const items = Array.from(e.dataTransfer.items);
        for (const item of items) {
          if (item.kind === 'file') {
            const f = item.getAsFile();
            if (f) files.push(f);
          }
        }
      }
      await this.importFiles(files);
    };
    // Click to open file dialog
    dropZone.onclick = () => {
      if (fileInput) fileInput.click();
    };
    // Handle file input change
    fileInput?.addEventListener('change', async () => {
      const files = Array.from(fileInput.files || []);
      await this.importFiles(files);
      fileInput.value = '';
    });
  }

  async importFiles(files: File[]) {
    // Support OBJ and optional MTL; match by basename
    const byName = new Map<string, File>();
    for (const f of files) byName.set(f.name.toLowerCase(), f);
    for (const f of files) {
      if (f.name.toLowerCase().endsWith('.obj')) {
        const base = f.name.replace(/\.obj$/i, '');
        const mtl = byName.get((base + '.mtl').toLowerCase());
        try {
          // Persist into project assets folder if available
          if (this.project && this.project.hasProject()) {
            await this.project.writeFileIn('assets', f.name, f);
            if (mtl) await this.project.writeFileIn('assets', mtl.name, mtl);
          }
          await this.importOBJ(f, mtl);
        } catch (err) {
          debugLog.error(`Failed to import ${f.name}: ${err}`);
        }
      }
    }
  }

  private async importOBJ(objFile: File, mtlFile?: File) {
    const text = await objFile.text();
    const mtlText = mtlFile ? await mtlFile.text() : undefined;
    const mtl = mtlText ? parseMTL(mtlText) : {} as any;
    const mesh = parseOBJ(text, mtl);
    const id = 'asset-' + Math.random().toString(36).slice(2);
    const asset: Asset = {
      id,
      name: objFile.name,
      type: 'mesh',
      positions: mesh.positions,
      normals: mesh.normals,
      material: mesh.material
    };
    this.assets.set(id, asset);
    this.renderAssetList();
    debugLog.info(`Imported asset: ${objFile.name}`);
  }

  // Load existing OBJ/MTL assets from the project assets directory
  async loadFromProject(): Promise<void> {
    if (!this.project || !this.project.hasProject()) return;
    const files = await this.project.listFiles('assets');
    const lower = new Map<string, string>();
    for (const f of files) lower.set(f.name.toLowerCase(), f.name);
    for (const f of files) {
      if (f.name.toLowerCase().endsWith('.obj')) {
        const base = f.name.replace(/\.obj$/i, '');
        const mtlName = lower.get((base + '.mtl').toLowerCase());
        const objText = await this.project.readTextFrom('assets', f.name) as string;
        const mtlText = mtlName ? await this.project.readTextFrom('assets', mtlName) : null;
        const mtl = mtlText ? parseMTL(mtlText) : {} as any;
        const mesh = parseOBJ(objText, mtl);
        const id = 'asset-' + Math.random().toString(36).slice(2);
        this.assets.set(id, {
          id,
          name: f.name,
          type: 'mesh',
          positions: mesh.positions,
          normals: mesh.normals,
          material: mesh.material
        });
      }
    }
    this.renderAssetList();
    debugLog.info('Loaded assets from project directory');
  }

  private renderAssetList() {
    this.container.innerHTML = '';
    for (const asset of this.list()) {
      const item = document.createElement('div');
      item.className = 'asset-item';
      item.draggable = true;
      item.textContent = `${asset.name}`;
      item.ondragstart = (e) => {
        e.dataTransfer?.setData('text/plain', `asset:${asset.id}`);
      };
      this.container.appendChild(item);
    }
  }

  instantiateAsset(assetId: string, parent: SceneNode): SceneNode | null {
    const asset = this.assets.get(assetId);
    if (!asset) return null;
    if (asset.type === 'mesh' && asset.positions) {
      const mesh = new Mesh(this.gl, asset.positions, asset.normals);
      const node = new SceneObject('obj-' + Math.random().toString(36).slice(2), asset.name.replace(/\.obj$/i, ''), mesh);
      const drawable = node['drawable'] as Drawable | null;
      if (drawable) {
        // Bounding box from positions
        const bb = this.computeBoundingBox(asset.positions);
        drawable.setBoundingBox(bb.min as any, bb.max as any);
        // Apply material defaults from MTL if present
        if (asset.material) {
          const c = asset.material.color || [0.8, 0.6, 0.4];
          drawable.material.color = vec3.fromValues(c[0], c[1], c[2]);
          if (asset.material.ambient != null) drawable.material.ambient = asset.material.ambient;
          if (asset.material.diffuse != null) drawable.material.diffuse = asset.material.diffuse;
          if (asset.material.specular != null) drawable.material.specular = asset.material.specular;
          if (asset.material.shininess != null) drawable.material.shininess = asset.material.shininess;
        }
      }
      this.renderer.addNodeTo(parent, node);
      return node;
    }
    return null;
  }

  private computeBoundingBox(positions: Float32Array) {
    let minX=Infinity,minY=Infinity,minZ=Infinity,maxX=-Infinity,maxY=-Infinity,maxZ=-Infinity;
    for (let i=0;i<positions.length;i+=3){
      const x=positions[i],y=positions[i+1],z=positions[i+2];
      if (x<minX) minX=x; if (y<minY) minY=y; if (z<minZ) minZ=z;
      if (x>maxX) maxX=x; if (y>maxY) maxY=y; if (z>maxZ) maxZ=z;
    }
    return { min: vec3.fromValues(minX,minY,minZ), max: vec3.fromValues(maxX,maxY,maxZ) };
  }

}
