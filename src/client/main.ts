import { WebGLRenderer } from './renderer';
import { debugLog } from './debug-logger';
import { InputController } from './input-controller';
import { SettingsController } from './settings-controller';
import { ObjectEditor } from './object-editor';
import { ObjectTreePanel } from './object-tree-panel';
import { AssetManager } from './asset-manager';
import { ProjectManager } from './project-manager';
import { SceneAST } from './scene-io';

async function main() {
    const canvas = document.getElementById('glcanvas') as HTMLCanvasElement;
    if (!canvas) {
        debugLog.error('Canvas not found');
        return;
    }

    // Canvas takes 70% of window width
    const shelf = document.getElementById('asset-shelf') as HTMLElement | null;
    const shelfHeight = shelf ? shelf.offsetHeight : 0;
    const canvasWidth = Math.floor(window.innerWidth * 0.7);
    const canvasHeight = window.innerHeight - shelfHeight;
    
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    
    debugLog.info(`Canvas initialized: ${canvasWidth}x${canvasHeight}`);

    const renderer = new WebGLRenderer(canvas);
    if (!renderer.initialize()) {
        debugLog.error('Failed to initialize WebGL2 renderer');
        return;
    }

    const inputController = new InputController(canvas, renderer.getCamera(), renderer);
    const settingsController = new SettingsController(inputController, renderer.getCamera(), renderer);
    const projectManager = new ProjectManager();
    const assetManager = new AssetManager(renderer, projectManager);
    const objectEditor = new ObjectEditor(renderer);
    const treePanel = new ObjectTreePanel(renderer, objectEditor, assetManager);
    // Start screen handler to open project on user gesture
    const startScreen = document.getElementById('start-screen') as HTMLElement | null;
    const openProjectStartBtn = document.getElementById('open-project-start') as HTMLButtonElement | null;
    const newSceneBtn = document.getElementById('new-scene') as HTMLButtonElement | null;
    // Shelf tabs and content
    const shelfTabAssets = document.getElementById('shelf-tab-assets') as HTMLButtonElement | null;
    const shelfTabScenes = document.getElementById('shelf-tab-scenes') as HTMLButtonElement | null;
    const assetsContent = document.getElementById('assets-content') as HTMLElement | null;
    const scenesContent = document.getElementById('scenes-content') as HTMLElement | null;

    const openProject = async () => {
        const ok = await projectManager.pickProjectDirectory();
        if (ok) {
            await assetManager.setProject(projectManager);
            await assetManager.loadFromProject();
            // Try load project settings (nested structure)
            const cfg = await projectManager.readJSON('config', 'settings.json');
            if (cfg) {
                const controls = (cfg.controls) ? cfg.controls : cfg; // fallback for older flat files
                settingsController.applySettings(controls);
            }
            if (startScreen) startScreen.style.display = 'none';
            debugLog.info('Project opened');
        }
    };
    
    // Wire up File System Access API buttons
    const saveBtn = document.getElementById('save-scene') as HTMLButtonElement | null;
    const loadBtn = document.getElementById('load-scene') as HTMLButtonElement | null;
    // Removed inline Open Project control; use start screen only
    
    async function saveScene() {
        try {
            const ast: SceneAST = renderer.exportSceneAST();
            if (projectManager.hasProject()) {
                const name = prompt('Scene file name (without extension):', 'scene');
                const fname = (name && name.trim() ? name.trim() : 'scene') + '.json';
                await projectManager.writeFileIn('scenes', fname, new Blob([JSON.stringify(ast, null, 2)], { type: 'application/json' }));
                debugLog.info(`Scene saved to project: scenes/${fname}`);
                // Refresh scenes grid if we're currently viewing the scenes tab
                if (scenesContent && getComputedStyle(scenesContent).display !== 'none') {
                    await renderScenesGrid();
                }
            } else {
                const opts = {
                    suggestedName: 'scene.json',
                    types: [{ description: 'JSON Files', accept: { 'application/json': ['.json'] } }]
                } as any;
                const handle = await (window as any).showSaveFilePicker(opts);
                const writable = await handle.createWritable();
                await writable.write(JSON.stringify(ast, null, 2));
                await writable.close();
                debugLog.info('Scene saved to disk.');
            }
        } catch (err) {
            debugLog.error(`Save failed: ${err}`);
        }
    }

    async function loadScene() {
        try {
            const opts = {
                multiple: false,
                types: [{ description: 'JSON Files', accept: { 'application/json': ['.json'] } }]
            } as any;
            // @ts-ignore
            const [handle] = await (window as any).showOpenFilePicker(opts);
            const file = await handle.getFile();
            const text = await file.text();
            const ast = JSON.parse(text) as SceneAST;
            renderer.importSceneAST(ast);
            treePanel.refresh();
            objectEditor.setSelectedObject(null);
            debugLog.info('Scene loaded from disk.');
        } catch (err) {
            debugLog.error(`Load failed: ${err}`);
        }
    }
    
    saveBtn?.addEventListener('click', saveScene);
    loadBtn?.addEventListener('click', loadScene);
    openProjectStartBtn?.addEventListener('click', openProject);
    newSceneBtn?.addEventListener('click', async () => { await (window as any).createNewScene?.(); });
    // Shelf tab switching
    const hideAllShelfMenus = () => {
        const bg = document.getElementById('asset-bg-context-menu') as HTMLElement | null;
        const sm = document.getElementById('scene-context-menu') as HTMLElement | null;
        const ac = document.getElementById('asset-context-menu') as HTMLElement | null;
        const fc = document.getElementById('asset-folder-context-menu') as HTMLElement | null;
        if (bg) bg.style.display = 'none';
        if (sm) sm.style.display = 'none';
        if (ac) ac.style.display = 'none';
        if (fc) fc.style.display = 'none';
    };
    const showAssets = () => {
        if (assetsContent) assetsContent.style.display = 'grid';
        if (scenesContent) scenesContent.style.display = 'none';
        hideAllShelfMenus();
        // Update path line for assets (render list to refresh path)
        (assetManager as any).renderAssetList?.();
    };
    const showScenes = () => {
        if (assetsContent) assetsContent.style.display = 'none';
        if (scenesContent) scenesContent.style.display = 'grid';
        hideAllShelfMenus();
        // Set path line to Scenes root
        const path = document.getElementById('assets-path');
        if (path) path.innerHTML = '- <a href="#" data-path="">scenes</a>';
        renderScenesGrid();
    };
    shelfTabAssets?.addEventListener('click', showAssets);
    shelfTabScenes?.addEventListener('click', showScenes);

    // Scenes grid rendering and context menus
    const sceneMenu = document.getElementById('scene-context-menu') as HTMLElement | null;
    let sceneMenuTarget: string | null = null;
    document.addEventListener('click', () => { if (sceneMenu) sceneMenu.style.display = 'none'; });

    async function renderScenesGrid() {
        if (!scenesContent) return;
        scenesContent.innerHTML = '';
        if (!projectManager.hasProject()) return;
        const files = await projectManager.listFiles('scenes');
        for (const f of files) {
            if (!f.name.toLowerCase().endsWith('.json')) continue;
            const tile = document.createElement('div');
            tile.className = 'tile';
            tile.innerHTML = `<div class="icon">📄</div><div class="label"></div>`;
            (tile.querySelector('.label') as HTMLElement).textContent = f.name;
            tile.oncontextmenu = (e) => {
                e.preventDefault(); e.stopPropagation();
                hideAllShelfMenus();
                sceneMenuTarget = f.name;
                if (sceneMenu) {
                    sceneMenu.style.display = 'block';
                    const rect = sceneMenu.getBoundingClientRect();
                    const x = Math.min(e.clientX, window.innerWidth - rect.width - 4);
                    const y = Math.min(e.clientY, window.innerHeight - rect.height - 4);
                    sceneMenu.style.left = x + 'px'; sceneMenu.style.top = y + 'px';
                }
            };
            scenesContent.appendChild(tile);
        }
        // Right-click background for new/save-as (persistent handler)
        scenesContent.oncontextmenu = (e) => {
            const target = e.target as HTMLElement;
            const onTile = !!target.closest('.tile');
            if (!onTile) {
                e.preventDefault();
                hideAllShelfMenus();
                const bg = document.getElementById('asset-bg-context-menu') as HTMLElement | null;
                if (bg) {
                    // Toggle to scenes actions
                    const folderNew = bg.querySelector('[data-action="bg-folder-new"]') as HTMLElement | null;
                    const sceneNew = bg.querySelector('[data-action="bg-scene-new"]') as HTMLElement | null;
                    const sceneSaveAs = bg.querySelector('[data-action="bg-scene-saveas"]') as HTMLElement | null;
                    if (folderNew) folderNew.style.display = 'none';
                    if (sceneNew) sceneNew.style.display = 'block';
                    if (sceneSaveAs) sceneSaveAs.style.display = 'block';
                    bg.style.display = 'block';
                    const rect = bg.getBoundingClientRect();
                    const x = Math.min(e.clientX, window.innerWidth - rect.width - 4);
                    const y = Math.min(e.clientY, window.innerHeight - rect.height - 4);
                    bg.style.left = x + 'px'; bg.style.top = y + 'px';
                }
            }
        };
    }

    async function openSceneByName(name: string) {
        try {
            const txt = await projectManager.readTextFrom('scenes', name);
            if (!txt) return;
            const ast = JSON.parse(txt) as SceneAST;
            renderer.importSceneAST(ast);
            treePanel.refresh();
            objectEditor.setSelectedObject(null);
            debugLog.info('Scene loaded: ' + name);
        } catch (e) { debugLog.error('Failed to load scene: ' + e); }
    }

    function sceneHasContent(): boolean { return renderer.getSceneRoot().getChildCount() > 0; }

    async function showSceneSaveModal(): Promise<'save'|'discard'|'cancel'> {
        const modal = document.getElementById('scene-save-modal') as HTMLElement | null;
        const saveBtn = document.getElementById('scene-save-save') as HTMLButtonElement | null;
        const discardBtn = document.getElementById('scene-save-discard') as HTMLButtonElement | null;
        if (!modal || !saveBtn || !discardBtn) return 'cancel';
        return await new Promise((resolve) => {
            const onSave = () => { cleanup(); resolve('save'); };
            const onDiscard = () => { cleanup(); resolve('discard'); };
            const onBackdrop = (e: Event) => { if (e.target === modal) { cleanup(); resolve('cancel'); } };
            const cleanup = () => {
                modal.style.display = 'none';
                saveBtn.removeEventListener('click', onSave);
                discardBtn.removeEventListener('click', onDiscard);
                modal.removeEventListener('click', onBackdrop);
            };
            modal.style.display = 'flex';
            saveBtn.addEventListener('click', onSave);
            discardBtn.addEventListener('click', onDiscard);
            modal.addEventListener('click', onBackdrop);
        });
    }

    async function confirmSaveIfNeeded(): Promise<boolean> {
        if (!sceneHasContent()) return true;
        const choice = await showSceneSaveModal();
        if (choice === 'save') { await saveScene(); return true; }
        if (choice === 'discard') { return true; }
        return false; // cancel
    }

    sceneMenu?.addEventListener('click', async (e) => {
        const t = e.target as HTMLElement;
        const action = t?.getAttribute('data-action');
        if (!action) return;
        if (action === 'scene-open' && sceneMenuTarget) {
            if (!(await confirmSaveIfNeeded())) { sceneMenu.style.display = 'none'; return; }
            await openSceneByName(sceneMenuTarget);
            await renderScenesGrid();
        } else if (action === 'scene-rename' && sceneMenuTarget) {
            const oldName = sceneMenuTarget;
            const base = oldName.replace(/\.json$/i, '');
            const newNameInput = prompt('Rename scene (without .json):', base);
            if (newNameInput && newNameInput.trim()) {
                const newName = newNameInput.trim() + '.json';
                try {
                    const files = await projectManager.listFiles('scenes');
                    const exists = files.some(f => f.name.toLowerCase() === newName.toLowerCase());
                    if (exists) {
                        const overwrite = window.confirm('A scene with that name exists. Overwrite?');
                        if (!overwrite) { sceneMenu.style.display = 'none'; return; }
                    }
                    await projectManager.moveFile('scenes', oldName, newName);
                    debugLog.info(`Scene renamed: ${oldName} -> ${newName}`);
                    await renderScenesGrid();
                } catch (err) { debugLog.error('Rename failed: ' + err); }
            }
        } else if (action === 'scene-delete' && sceneMenuTarget) {
            const ok = await showSceneDeleteModal(sceneMenuTarget);
            if (ok) {
                try { await projectManager.deleteFileAt('scenes', sceneMenuTarget); await renderScenesGrid(); debugLog.info('Scene deleted: ' + sceneMenuTarget); }
                catch (err) { debugLog.error('Delete failed: ' + err); }
            }
        } else if (action === 'scene-saveas') {
            await saveScene();
        }
        sceneMenu.style.display = 'none';
    });

    async function showSceneDeleteModal(name: string): Promise<boolean> {
        const modal = document.getElementById('scene-confirm-modal') as HTMLElement | null;
        const msg = document.getElementById('scene-confirm-message') as HTMLElement | null;
        const accept = document.getElementById('scene-confirm-accept') as HTMLButtonElement | null;
        const cancel = document.getElementById('scene-confirm-cancel') as HTMLButtonElement | null;
        if (!modal || !msg || !accept || !cancel) return false;
        msg.textContent = `Delete scene "${name}"?`;
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

    // Expose helpers for asset shelf background menu
    (window as any).createNewScene = async () => {
        if (!(await confirmSaveIfNeeded())) return;
        // Clear current scene
        const root = renderer.getSceneRoot();
        const children = root.getChildren();
        for (const c of children) { c.removeFromParent(); }
        treePanel.refresh();
        objectEditor.setSelectedObject(null);
        debugLog.info('New empty scene created.');
    };
    (window as any).saveCurrentSceneAs = async () => {
        await saveScene();
    };


    // Persist settings to project on change (nested under controls)
    document.addEventListener('app-settings-changed', async (ev: any) => {
        if (!projectManager.hasProject()) return;
        try {
            const curr = (await projectManager.readJSON('config', 'settings.json')) || {};
            curr.controls = { ...(curr.controls || {}), ...ev.detail };
            await projectManager.writeJSON('config', 'settings.json', curr);
        } catch (e) {
            debugLog.error('Failed to save settings: ' + e);
        }
    });
    
    let lastTime = 0;
    function render(currentTime: number) {
        const deltaTime = (currentTime - lastTime) / 1000; // Convert to seconds
        lastTime = currentTime;
        
        inputController.update(deltaTime);
        objectEditor.checkForSelection();
        treePanel.syncWithRenderer(); // Keep tree selection in sync
        renderer.render();
        requestAnimationFrame(render);
    }

    requestAnimationFrame(render);
    debugLog.info('Render loop started with input controls');

    window.addEventListener('resize', () => {
        const shelf2 = document.getElementById('asset-shelf') as HTMLElement | null;
        const shelfH = shelf2 ? shelf2.offsetHeight : 0;
        const newCanvasWidth = Math.floor(window.innerWidth * 0.7);
        const newCanvasHeight = window.innerHeight - shelfH;
        
        canvas.width = newCanvasWidth;
        canvas.height = newCanvasHeight;
        renderer.resize(newCanvasWidth, newCanvasHeight);
        
        debugLog.info(`Window resized: ${newCanvasWidth}x${newCanvasHeight}`);
    });
}

window.addEventListener('DOMContentLoaded', main);
