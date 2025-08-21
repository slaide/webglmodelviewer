import { WebGLRenderer } from './renderer';
import { SceneNode } from './scene-node';
import { SceneObject } from './scene-object';
import { Drawable } from './drawable';
import { Mesh } from './geometry/mesh';
import { MeshRegistry } from './mesh-registry';
import { ProjectManager } from './project-manager';
import { vec3 } from 'gl-matrix';
import { debugLog } from './debug-logger';
import { parseOBJ, parseMTL } from './parsers/obj-mtl';

export type AssetType = 'mesh';

export interface Asset {
  id: string;
  name: string;
  relPath?: string;
  type: AssetType;
  // For meshes
  positions?: Float32Array;
  normals?: Float32Array;
  uvs?: Float32Array;
  material?: {
    color?: [number, number, number];
    ambient?: number;
    diffuse?: number;
    specular?: number;
    shininess?: number;
    texture?: string;
  };
  meta?: {
    hasUVs?: boolean;
    hasNormals?: boolean;
    smoothing?: boolean;
    groups?: string[];
    objects?: string[];
    materialsUsed?: { name: string; texture?: string }[];
  };
  submeshes?: {
    name: string;
    positions: Float32Array;
    normals?: Float32Array;
    uvs?: Float32Array;
    material?: Asset['material'];
  }[];
}

export class AssetManager {
  private assets = new Map<string, Asset>();
  private container: HTMLElement;
  private gl: WebGL2RenderingContext;
  private textureCache: Map<string, WebGLTexture> = new Map();
  private assetMenuTargetId: string | null = null;
  private folderMenuTargetPath: string | null = null;
  private currentFolderPath: string = '';

  constructor(private renderer: WebGLRenderer, private project?: ProjectManager) {
    this.gl = renderer.getGLContext();
    const container = document.getElementById('assets-content');
    if (!container) throw new Error('Assets container not found');
    this.container = container;
    this.setupDnD();
    // Background context menu
    const grid = document.getElementById('assets-content');
    if (grid) {
      grid.addEventListener('contextmenu', (e) => {
        const target = e.target as HTMLElement;
        const onTile = !!target.closest('.tile');
        if (!onTile) {
          e.preventDefault(); e.stopPropagation(); this.showBgContextMenu(e.clientX, e.clientY);
        }
      });
    }
    // Initialize context menus
    this.initializeContextMenus();
    // Tile size slider
    const shelf = document.getElementById('asset-shelf') as HTMLElement | null;
    const slider = document.getElementById('assets-tile-size') as HTMLInputElement | null;
    const saved = Number(localStorage.getItem('assetsTileSize') || '0');
    const initSize = (!isNaN(saved) && saved >= 80 && saved <= 200) ? saved : 120;
    if (shelf) shelf.style.setProperty('--tile-size', initSize + 'px');
    if (slider) {
      slider.value = String(initSize);
      slider.addEventListener('input', async () => {
        const v = Math.max(80, Math.min(200, Number(slider.value || 120)));
        if (shelf) shelf.style.setProperty('--tile-size', v + 'px');
        localStorage.setItem('assetsTileSize', String(v));
        await this.saveTileSizeToProject(v).catch(() => {});
      });
    }
  }

  async setProject(project: ProjectManager) {
    this.project = project;
    // Try load tile size from project
    await this.loadTileSizeFromProject().catch(() => {});
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
      relPath: objFile.name,
      type: 'mesh',
      positions: mesh.positions,
      normals: mesh.normals,
      uvs: mesh.uvs,
      material: mesh.material,
      meta: mesh.meta,
      submeshes: mesh.submeshes?.map(sm => ({
        name: sm.name,
        positions: sm.positions,
        normals: sm.normals,
        uvs: sm.uvs,
        material: sm.material as any
      }))
    };
    this.assets.set(id, asset);
    await this.renderAssetList();
    debugLog.info(`Imported asset: ${objFile.name}`);
  }

  // Load existing OBJ/MTL assets from the project assets directory (supports folders)
  async loadFromProject(): Promise<void> {
    if (!this.project || !this.project.hasProject()) return;
    const files = await this.project.listFilesRecursive('assets');
    const lower = new Map<string, string>();
    for (const f of files) lower.set(f.path.toLowerCase(), f.path);
    for (const f of files) {
      if (f.path.toLowerCase().endsWith('.obj')) {
        const base = f.path.replace(/\.obj$/i, '');
        const mtlPath = lower.get((base + '.mtl').toLowerCase());
        const objText = await this.project.readTextAt('assets', f.path) as string;
        const mtlText = mtlPath ? await this.project.readTextAt('assets', mtlPath) : null;
        const mtl = mtlText ? parseMTL(mtlText) : {} as any;
        const mesh = parseOBJ(objText, mtl);
        const id = 'asset-' + Math.random().toString(36).slice(2);
        this.assets.set(id, {
          id,
          name: f.path.split('/').pop() || f.path,
          relPath: f.path,
          type: 'mesh',
          positions: mesh.positions,
          normals: mesh.normals,
          uvs: mesh.uvs,
          material: mesh.material,
          meta: mesh.meta,
          submeshes: mesh.submeshes?.map(sm => ({
            name: sm.name,
            positions: sm.positions,
            normals: sm.normals,
            uvs: sm.uvs,
            material: sm.material as any
          }))
        });
      }
    }
    await this.renderAssetList();
    debugLog.info('Loaded assets from project directory');
  }


  private async showGlobalConfirm(message: string): Promise<boolean> {
    const modal = document.getElementById('confirm-modal') as HTMLElement | null;
    const msg = document.getElementById('confirm-modal-message') as HTMLElement | null;
    const accept = document.getElementById('confirm-accept') as HTMLButtonElement | null;
    const cancel = document.getElementById('confirm-cancel') as HTMLButtonElement | null;
    if (!modal || !msg || !accept || !cancel) return false;
    msg.textContent = message;
    return await new Promise((resolve) => {
      const onAccept = () => { cleanup(); resolve(true); };
      const onCancel = () => { cleanup(); resolve(false); };
      const onBackdrop = (e: Event) => { if (e.target === modal) { cleanup(); resolve(false); } };
      const cleanup = () => {
        modal.style.display = 'none';
        accept.removeEventListener('click', onAccept);
        cancel.removeEventListener('click', onCancel);
        modal.removeEventListener('click', onBackdrop);
      };
      modal.style.display = 'flex';
      accept.addEventListener('click', onAccept);
      cancel.addEventListener('click', onCancel);
      modal.addEventListener('click', onBackdrop);
    });
  }

  // Context menu initialization - wire up once in constructor
  private initializeContextMenus() {
    // Background context menu
    const bgMenu = document.getElementById('asset-bg-context-menu');
    if (bgMenu) {
      document.addEventListener('click', () => this.hideBgContextMenu());
      bgMenu.addEventListener('click', this.handleBgMenuClick.bind(this));
    }
    
    // Asset context menu
    this.initializeAssetMenu();
    
    // Folder context menu
    this.initializeFolderMenu();
  }

  private async handleBgMenuClick(e: Event) {
    const target = e.target as HTMLElement;
    const action = target?.getAttribute('data-action');
    if (!action) return;

    this.hideBgContextMenu();
    
    switch (action) {
      case 'bg-folder-new':
        await this.promptAndCreateFolder(this.currentFolderPath);
        break;
      case 'bg-scene-new':
        await this.handleNewScene();
        break;
      case 'bg-scene-saveas':
        await this.handleSaveSceneAs();
        break;
    }
  }

  private async handleNewScene() {
    // Call the global function if available, otherwise handle locally
    if ((window as any).createNewScene) {
      await (window as any).createNewScene();
    } else {
      debugLog.warn('createNewScene function not available');
    }
  }

  private async handleSaveSceneAs() {
    // Call the global function if available, otherwise handle locally  
    if ((window as any).saveCurrentSceneAs) {
      await (window as any).saveCurrentSceneAs();
    } else {
      debugLog.warn('saveCurrentSceneAs function not available');
    }
  }

  private initializeAssetMenu() {
    const assetMenu = document.getElementById('asset-context-menu');
    if (assetMenu) {
      document.addEventListener('click', () => this.hideAssetContextMenu());
      assetMenu.addEventListener('click', (e) => this.onAssetMenuClick(e));
    }
    
    // Initialize asset confirmation modal
    const assetConfirmModal = document.getElementById('asset-confirm-modal');
    const assetConfirmAccept = document.getElementById('asset-confirm-accept') as HTMLButtonElement | null;
    const assetConfirmCancel = document.getElementById('asset-confirm-cancel') as HTMLButtonElement | null;
    
    if (assetConfirmModal && assetConfirmAccept && assetConfirmCancel) {
      assetConfirmCancel.addEventListener('click', () => this.hideAssetConfirm());
      assetConfirmModal.addEventListener('click', (e) => { if (e.target === assetConfirmModal) this.hideAssetConfirm(); });
      assetConfirmAccept.addEventListener('click', async () => {
        const id = this.assetMenuTargetId;
        this.hideAssetConfirm();
        if (id) await this.deleteAssetById(id);
      });
    }
  }

  private initializeFolderMenu() {
    const folderMenu = document.getElementById('asset-folder-context-menu');
    if (folderMenu) {
      document.addEventListener('click', () => this.hideFolderContextMenu());
      folderMenu.addEventListener('click', (e) => this.onFolderMenuClick(e));
    }
  }
  private showBgContextMenu(x: number, y: number) {
    const bgMenu = document.getElementById('asset-bg-context-menu');
    if (!bgMenu) return;
    
    // Toggle items based on active tab (assets vs scenes)
    const assetsGrid = document.getElementById('assets-content') as HTMLElement | null;
    const scenesGrid = document.getElementById('scenes-content') as HTMLElement | null;
    const isScenes = !!(scenesGrid && getComputedStyle(scenesGrid).display !== 'none');
    const folderNew = bgMenu.querySelector('[data-action="bg-folder-new"]') as HTMLElement | null;
    const sceneNew = bgMenu.querySelector('[data-action="bg-scene-new"]') as HTMLElement | null;
    const sceneSaveAs = bgMenu.querySelector('[data-action="bg-scene-saveas"]') as HTMLElement | null;
    if (folderNew) folderNew.style.display = isScenes ? 'none' : 'block';
    if (sceneNew) sceneNew.style.display = isScenes ? 'block' : 'none';
    if (sceneSaveAs) sceneSaveAs.style.display = isScenes ? 'block' : 'none';
    bgMenu.style.display = 'block';
    const rect = bgMenu.getBoundingClientRect();
    const vw = window.innerWidth, vh = window.innerHeight;
    const posX = Math.min(x, vw - rect.width - 4);
    const posY = Math.min(y, vh - rect.height - 4);
    bgMenu.style.left = posX + 'px';
    bgMenu.style.top = posY + 'px';
  }
  private hideBgContextMenu() { 
    const bgMenu = document.getElementById('asset-bg-context-menu');
    if (bgMenu) bgMenu.style.display = 'none'; 
  }

  // Persist tile size in project config
  private async loadTileSizeFromProject() {
    if (!this.project || !this.project.hasProject()) return;
    const cfg = await this.project.readJSON('config', 'settings.json');
    const v = cfg && cfg.assetShelf && typeof cfg.assetShelf.tileSize === 'number' ? cfg.assetShelf.tileSize : null;
    const shelf = document.getElementById('asset-shelf') as HTMLElement | null;
    const slider = document.getElementById('assets-tile-size') as HTMLInputElement | null;
    if (v && v >= 80 && v <= 200) {
      if (shelf) shelf.style.setProperty('--tile-size', v + 'px');
      if (slider) slider.value = String(v);
    }
  }
  private async saveTileSizeToProject(v: number) {
    if (!this.project || !this.project.hasProject()) return;
    const cfg = (await this.project.readJSON('config', 'settings.json')) || {};
    cfg.assetShelf = cfg.assetShelf || {};
    cfg.assetShelf.tileSize = v;
    await this.project.writeJSON('config', 'settings.json', cfg);
  }

  private showAssetContextMenu(x: number, y: number, asset: Asset) {
    const assetMenu = document.getElementById('asset-context-menu');
    this.assetMenuTargetId = asset.id;
    if (!assetMenu) return;
    assetMenu.style.display = 'block';
    const rect = assetMenu.getBoundingClientRect();
    const vw = window.innerWidth, vh = window.innerHeight;
    const posX = Math.min(x, vw - rect.width - 4);
    const posY = Math.min(y, vh - rect.height - 4);
    assetMenu.style.left = posX + 'px';
    assetMenu.style.top = posY + 'px';
  }

  private hideAssetContextMenu() {
    const assetMenu = document.getElementById('asset-context-menu');
    if (assetMenu) assetMenu.style.display = 'none';
  }

  private onAssetMenuClick(e: Event) {
    const target = e.target as HTMLElement;
    const action = target?.getAttribute('data-action');
    if (!action) return;
    if (action === 'asset-rename' && this.assetMenuTargetId) {
      const a = this.assets.get(this.assetMenuTargetId);
      this.hideAssetContextMenu();
      if (!a || !a.relPath) return;
      const baseDir = (a.relPath.split('/').slice(0, -1).join('/'));
      const newName = prompt('Rename asset (keep .obj extension):', a.name) || '';
      if (!newName.trim()) return;
      const newRel = baseDir ? `${baseDir}/${newName.trim()}` : newName.trim();
      this.renameAssetRelPath(a.id, newRel).catch(err => debugLog.error(String(err)));
    }
    if (action === 'asset-delete' && this.assetMenuTargetId) {
      const a = this.assets.get(this.assetMenuTargetId);
      this.hideAssetContextMenu();
      if (a) this.showGlobalConfirm(`Delete asset \"${a.name}\"?`).then(async ok => { if (ok) await this.deleteAssetById(a.id); });
    }
  }

  private showAssetConfirm(message: string, assetId: string) { /* deprecated */ }
  private hideAssetConfirm() { /* deprecated */ }

  private async deleteAssetById(id: string) {
    const a = this.assets.get(id);
    if (!a) return;
    try {
      if (this.project && this.project.hasProject() && a.relPath) {
        await this.project.deleteFileAt('assets', a.relPath);
        const base = a.relPath.replace(/\.obj$/i, '');
        const mtlRel = base + '.mtl';
        try { await this.project.deleteFileAt('assets', mtlRel); } catch {}
      }
    } catch (e) {
      debugLog.error('Failed to delete asset file: ' + e);
    }
    this.assets.delete(id);
    await this.renderAssetList();
  }

  private async renameAssetRelPath(id: string, newRelPath: string) {
    const a = this.assets.get(id);
    if (!a || !a.relPath || !this.project || !this.project.hasProject()) return;
    try {
      await this.project.moveFile('assets', a.relPath, newRelPath);
      const baseOld = a.relPath.replace(/\.obj$/i, '');
      const baseNew = newRelPath.replace(/\.obj$/i, '');
      try { await this.project.moveFile('assets', baseOld + '.mtl', baseNew + '.mtl'); } catch {}
      a.relPath = newRelPath;
      a.name = newRelPath.split('/').pop() || newRelPath;
      await this.renderAssetList();
      debugLog.info('Renamed asset to ' + a.name);
    } catch (e) {
      debugLog.error('Failed to rename asset: ' + e);
    }
  }

  // Folder context and operations
  private showFolderContextMenu(x: number, y: number, folderPath: string) {
    const folderMenu = document.getElementById('asset-folder-context-menu');
    this.folderMenuTargetPath = folderPath;
    if (!folderMenu) return;
    folderMenu.style.display = 'block';
    const rect = folderMenu.getBoundingClientRect();
    const vw = window.innerWidth, vh = window.innerHeight;
    const posX = Math.min(x, vw - rect.width - 4);
    const posY = Math.min(y, vh - rect.height - 4);
    folderMenu.style.left = posX + 'px';
    folderMenu.style.top = posY + 'px';
  }
  private hideFolderContextMenu() { 
    const folderMenu = document.getElementById('asset-folder-context-menu');
    if (folderMenu) folderMenu.style.display = 'none'; 
  }
  private async onFolderMenuClick(e: Event) {
    const target = e.target as HTMLElement;
    const action = target?.getAttribute('data-action');
    if (!action) return;
    if (action === 'folder-new') {
      const base = this.folderMenuTargetPath || '';
      this.hideFolderContextMenu();
      await this.promptAndCreateFolder(base);
    } else if (action === 'folder-rename' && this.folderMenuTargetPath) {
      const base = this.folderMenuTargetPath.split('/').slice(0, -1).join('/');
      const name = this.folderMenuTargetPath.split('/').pop() || '';
      this.hideFolderContextMenu();
      const newName = prompt('Rename folder:', name) || '';
      if (!newName.trim()) return;
      await this.renameFolder(this.folderMenuTargetPath, base ? `${base}/${newName.trim()}` : newName.trim());
    } else if (action === 'folder-delete' && this.folderMenuTargetPath) {
      this.hideFolderContextMenu();
      if (await this.showGlobalConfirm(`Delete folder "${this.folderMenuTargetPath}" and all contents?`)) {
        await this.deleteFolder(this.folderMenuTargetPath);
      }
    }
  }

  private async renameFolder(oldPath: string, newPath: string) {
    if (!this.project || !this.project.hasProject()) return;
    try {
      const files = await this.project.listFilesRecursive('assets');
      for (const f of files) {
        if (f.path === oldPath || f.path.startsWith(oldPath + '/')) {
          const suffix = f.path.slice(oldPath.length);
          const target = newPath + suffix;
          await this.project.moveFile('assets', f.path, target);
          for (const [id, a] of this.assets) {
            if (a.relPath === f.path) { a.relPath = target; a.name = target.split('/').pop() || target; }
          }
        }
      }
      if (this.currentFolderPath === oldPath || this.currentFolderPath.startsWith(oldPath + '/')) {
        this.currentFolderPath = this.currentFolderPath.replace(oldPath, newPath);
      }
      await this.renderAssetList();
    } catch (e) {
      debugLog.error('Failed to rename folder: ' + e);
    }
  }

  private async deleteFolder(path: string) {
    if (!this.project || !this.project.hasProject()) return;
    try {
      await this.project.deleteFolderAt('assets', path, true);
      for (const [id, a] of Array.from(this.assets.entries())) {
        if (a.relPath && (a.relPath === path || a.relPath.startsWith(path + '/'))) this.assets.delete(id);
      }
      if (this.currentFolderPath === path || this.currentFolderPath.startsWith(path + '/')) this.currentFolderPath = '';
      await this.renderAssetList();
    } catch (e) {
      debugLog.error('Failed to delete folder: ' + e);
    }
  }

  private inspectAsset(asset: Asset) {
    const tabs = document.querySelectorAll('.tab-content');
    tabs.forEach(t => t.classList.remove('active'));
    const buttons = document.querySelectorAll('.tab-button');
    buttons.forEach(b => b.classList.remove('active'));
    const editorTab = document.getElementById('editor-tab');
    const editorButton = Array.from(document.querySelectorAll('.tab-button')).find(b => (b as HTMLElement).innerText === 'Editor') as HTMLElement | undefined;
    if (editorTab) editorTab.classList.add('active');
    if (editorButton) editorButton.classList.add('active');
    const noSel = document.getElementById('no-selection');
    const objEd = document.getElementById('object-editor');
    const assetInfo = document.getElementById('asset-info');
    if (noSel) noSel.style.display = 'none';
    if (objEd) objEd.style.display = 'none';
    if (assetInfo) assetInfo.style.display = 'block';
    const nameEl = document.getElementById('asset-info-name');
    const pathEl = document.getElementById('asset-info-path');
    const vEl = document.getElementById('asset-info-verts');
    const smEl = document.getElementById('asset-info-submeshes');
    if (nameEl) nameEl.textContent = asset.name;
    if (pathEl) pathEl.textContent = asset.relPath || asset.name;
    if (vEl) vEl.textContent = asset.positions ? String(Math.floor(asset.positions.length / 3)) : '-';
    if (smEl) smEl.textContent = asset.submeshes ? String(asset.submeshes.length) : '0';
    const rn = document.getElementById('asset-info-rename') as HTMLButtonElement | null;
    const dl = document.getElementById('asset-info-delete') as HTMLButtonElement | null;
    if (rn) rn.onclick = () => {
      const baseDir = (asset.relPath || '').split('/').slice(0, -1).join('/');
      const newName = prompt('Rename asset:', asset.name) || '';
      if (!newName.trim()) return;
      const newRel = baseDir ? `${baseDir}/${newName.trim()}` : newName.trim();
      this.renameAssetRelPath(asset.id, newRel);
    };
    if (dl) dl.onclick = () => this.showAssetConfirm(`Delete asset "${asset.name}"?`, asset.id);
  }

  private async promptAndCreateFolder(basePath: string) {
    const name = prompt('New folder name:');
    if (!name || !name.trim()) return;
    await this.createFolderAt(basePath ? `${basePath}/${name.trim()}` : name.trim());
  }

  private async createFolderAt(relPath: string) {
    if (!this.project || !this.project.hasProject()) return;
    try {
      await this.project.ensureDirPath('assets', relPath);
      // Navigate into the newly created folder
      this.currentFolderPath = relPath;
      await this.renderAssetList();
      debugLog.info('Created folder: ' + (relPath || '/'));
    } catch (e) {
      debugLog.error('Failed to create folder: ' + e);
    }
  }

  private async moveAssetToFolder(assetId: string, folderPath: string) {
    if (!this.project || !this.project.hasProject()) return;
    const a = this.assets.get(assetId);
    if (!a || !a.relPath) return;
    const fileName = a.relPath.split('/').pop() as string;
    const newRel = folderPath ? `${folderPath}/${fileName}` : fileName;
    try {
      await this.project.ensureDirPath('assets', folderPath);
      await this.project.moveFile('assets', a.relPath, newRel);
      const baseOld = a.relPath.replace(/\.obj$/i, '');
      const baseNew = newRel.replace(/\.obj$/i, '');
      try { await this.project.moveFile('assets', baseOld + '.mtl', baseNew + '.mtl'); } catch {}
      a.relPath = newRel;
      await this.renderAssetList();
      debugLog.info(`Moved asset to ${newRel}`);
    } catch (e) {
      debugLog.error('Failed to move asset: ' + e);
    }
  }

  private async renderAssetList() {
    this.container.innerHTML = '';
    const bc = document.getElementById('assets-path');
    if (bc) {
      const parts = this.currentFolderPath.split('/').filter(Boolean);
      const crumbs: string[] = [];
      crumbs.push('<span>-</span>');
      // Root link
      crumbs.push(' <a href=\"#\" data-path=\"\">assets</a>');
      // Subpath segments
      let accum = '';
      parts.forEach((p) => {
        accum = accum ? `${accum}/${p}` : p;
        crumbs.push(' <span>/</span> ');
        crumbs.push(`<a href=\"#\" data-path=\"${accum}\">${p}</a>`);
      });
      bc.innerHTML = crumbs.join('');
      bc.querySelectorAll('a[data-path]').forEach(a => {
        a.addEventListener('click', (e) => {
          e.preventDefault();
          const path = (e.currentTarget as HTMLElement).getAttribute('data-path') || '';
          this.currentFolderPath = path;
          this.renderAssetList();
        });
      });
    }
    const subfolders = new Set<string>();
    const assetsHere: Asset[] = [];
    for (const asset of this.list()) {
      const rel = asset.relPath || asset.name;
      if (this.currentFolderPath && !rel.startsWith(this.currentFolderPath + '/')) continue;
      const relative = this.currentFolderPath ? rel.slice(this.currentFolderPath.length + 1) : rel;
      const parts = relative.split('/').filter(Boolean);
      if (parts.length > 1) subfolders.add(parts[0]);
      else if (parts.length === 1) assetsHere.push(asset);
    }
    // Include empty subfolders from filesystem
    try {
      if (this.project && this.project.hasProject()) {
        const entries = await this.project.listEntriesAt('assets', this.currentFolderPath);
        for (const ent of entries) { if (ent.kind === 'directory') subfolders.add(ent.name); }
      }
    } catch {}

    subfolders.forEach(fname => {
      const tile = document.createElement('div');
      tile.className = 'tile';
      tile.innerHTML = `<div class="icon">📁</div><div class="label"></div>`;
      (tile.querySelector('.label') as HTMLElement).textContent = fname;
      tile.oncontextmenu = (e) => { e.preventDefault(); e.stopPropagation(); this.showFolderContextMenu(e.clientX, e.clientY, this.currentFolderPath ? `${this.currentFolderPath}/${fname}` : fname); };
      tile.onclick = () => { this.currentFolderPath = this.currentFolderPath ? `${this.currentFolderPath}/${fname}` : fname; this.renderAssetList(); };
      tile.ondragover = (e) => { e.preventDefault(); tile.classList.add('drop-target'); };
      tile.ondragleave = () => tile.classList.remove('drop-target');
      tile.ondrop = async (e) => {
        e.preventDefault(); tile.classList.remove('drop-target');
        const payload = e.dataTransfer?.getData('text/plain') || '';
        if (payload.startsWith('asset:')) { const id = payload.slice('asset:'.length); await this.moveAssetToFolder(id, this.currentFolderPath ? `${this.currentFolderPath}/${fname}` : fname); }
      };
      this.container.appendChild(tile);
    });
    for (const asset of assetsHere) {
      const tile = document.createElement('div');
      tile.className = 'tile';
      tile.draggable = true;
      tile.innerHTML = `<div class="icon">🧊</div><div class="label"></div>`;
      (tile.querySelector('.label') as HTMLElement).textContent = asset.name;
      tile.ondragstart = (e) => { e.dataTransfer?.setData('text/plain', `asset:${asset.id}`); };
      tile.oncontextmenu = (e) => { e.preventDefault(); e.stopPropagation(); this.showAssetContextMenu(e.clientX, e.clientY, asset); };
      tile.onclick = () => this.inspectAsset(asset);
      this.container.appendChild(tile);
    }
  }

  instantiateAsset(assetId: string, parent: SceneNode): SceneNode | null {
    const asset = this.assets.get(assetId);
    if (!asset) return null;
    if (asset.type === 'mesh' && asset.positions) {
      if (asset.submeshes && asset.submeshes.length > 0) {
        const parentNode = new SceneNode('grp-' + Math.random().toString(36).slice(2), asset.name.replace(/\.obj$/i, ''));
        this.renderer.addNodeTo(parent, parentNode);
        for (let i = 0; i < asset.submeshes.length; i++) {
          this.instantiateAssetSubmesh(assetId, i, parentNode);
        }
        return parentNode;
      } else {
        const meshId = `asset:${asset.id}:full`;
        const mesh = MeshRegistry.get(this.gl, meshId, () => new Mesh(this.gl, asset.positions!, asset.normals, asset.meta || {}, asset.uvs));
        const node = new SceneObject('obj-' + Math.random().toString(36).slice(2), asset.name.replace(/\.obj$/i, ''), mesh);
        const drawable = node['drawable'] as Drawable | null;
        if (drawable) {
          (drawable as any).meshId = meshId;
          const bb = this.computeBoundingBox(asset.positions!);
          drawable.setBoundingBox(bb.min as any, bb.max as any);
          if (asset.material) {
            const c = asset.material.color || [0.8, 0.6, 0.4];
            drawable.material.color = vec3.fromValues(c[0], c[1], c[2]);
            if (asset.material.ambient != null) drawable.material.ambient = asset.material.ambient;
            if (asset.material.diffuse != null) drawable.material.diffuse = asset.material.diffuse;
            if (asset.material.specular != null) drawable.material.specular = asset.material.specular;
            if (asset.material.shininess != null) drawable.material.shininess = asset.material.shininess;
            if (asset.material.texture) {
              (drawable.material as any).texture = asset.material.texture;
              this.loadTextureToDrawable(drawable, asset.material.texture).catch(err => debugLog.error(String(err)));
            }
          }
        }
        this.renderer.addNodeTo(parent, node);
        return node;
      }
    }
    return null;
  }

  instantiateAssetSubmesh(assetId: string, index: number, parent: SceneNode): SceneNode | null {
    const asset = this.assets.get(assetId);
    if (!asset || !asset.submeshes || !asset.submeshes[index]) return null;
    const sm = asset.submeshes[index];
    const meshId = `asset:${assetId}:sub:${index}`;
    const mesh = MeshRegistry.get(this.gl, meshId, () => new Mesh(this.gl, sm.positions, sm.normals, asset.meta || {}, sm.uvs));
    const node = new SceneObject('obj-' + Math.random().toString(36).slice(2), sm.name || asset.name, mesh);
    const drawable = node['drawable'] as Drawable | null;
    if (drawable) {
      (drawable as any).meshId = meshId;
      const bb = this.computeBoundingBox(sm.positions);
      drawable.setBoundingBox(bb.min as any, bb.max as any);
      if (sm.material) {
        const c = sm.material.color || [0.8,0.6,0.4];
        drawable.material.color = vec3.fromValues(c[0],c[1],c[2]);
        if (sm.material.ambient != null) drawable.material.ambient = sm.material.ambient;
        if (sm.material.diffuse != null) drawable.material.diffuse = sm.material.diffuse;
        if (sm.material.specular != null) drawable.material.specular = sm.material.specular;
        if (sm.material.shininess != null) drawable.material.shininess = sm.material.shininess;
        if (sm.material.texture) {
          (drawable.material as any).texture = sm.material.texture;
          this.loadTextureToDrawable(drawable, sm.material.texture).catch(err => debugLog.error(String(err)));
        }
      }
    }
    this.renderer.addNodeTo(parent, node);
    return node;
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

  private async loadTextureToDrawable(drawable: Drawable, texName: string) {
    try {
      if (!this.project || !this.project.hasProject()) return;
      if (this.textureCache.has(texName.toLowerCase())) {
        (drawable as any).glTexture = this.textureCache.get(texName.toLowerCase());
        return;
      }
      let blob: Blob | null = null;
      const files = await this.project.listFiles('assets');
      const m = files.find(f => f.name.toLowerCase() === texName.toLowerCase());
      if (m) {
        const file = await m.handle.getFile();
        blob = file;
      }
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = reject;
        img.src = url;
      });
      const gl = this.gl;
      const tex = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.bindTexture(gl.TEXTURE_2D, null);
      (drawable as any).glTexture = tex;
      this.textureCache.set(texName.toLowerCase(), tex);
      URL.revokeObjectURL(url);
      debugLog.info(`Loaded texture: ${texName}`);
    } catch (e) {
      debugLog.error(`Texture load failed: ${e}`);
    }
  }

}
