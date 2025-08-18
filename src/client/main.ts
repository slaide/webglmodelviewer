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

    const openProject = async () => {
        const ok = await projectManager.pickProjectDirectory();
        if (ok) {
            assetManager.setProject(projectManager);
            await assetManager.loadFromProject();
            if (startScreen) startScreen.style.display = 'none';
            debugLog.info('Project opened');
        }
    };
    
    // Wire up File System Access API buttons
    const saveBtn = document.getElementById('save-scene') as HTMLButtonElement | null;
    const loadBtn = document.getElementById('load-scene') as HTMLButtonElement | null;
    const openProjectBtn = document.getElementById('open-project') as HTMLButtonElement | null;
    
    async function saveScene() {
        try {
            const ast: SceneAST = renderer.exportSceneAST();
            if (projectManager.hasProject()) {
                const name = prompt('Scene file name (without extension):', 'scene');
                const fname = (name && name.trim() ? name.trim() : 'scene') + '.json';
                await projectManager.writeFileIn('scenes', fname, new Blob([JSON.stringify(ast, null, 2)], { type: 'application/json' }));
                debugLog.info(`Scene saved to project: scenes/${fname}`);
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
    openProjectBtn?.addEventListener('click', openProject);
    openProjectStartBtn?.addEventListener('click', openProject);
    
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
