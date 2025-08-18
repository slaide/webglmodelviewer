import { WebGLRenderer } from './renderer';
import { debugLog } from './debug-logger';
import { InputController } from './input-controller';
import { SettingsController } from './settings-controller';
import { ObjectEditor } from './object-editor';

function main() {
    const canvas = document.getElementById('glcanvas') as HTMLCanvasElement;
    if (!canvas) {
        debugLog.error('Canvas not found');
        return;
    }

    // Canvas takes 70% of window width
    const canvasWidth = Math.floor(window.innerWidth * 0.7);
    const canvasHeight = window.innerHeight;
    
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
    const objectEditor = new ObjectEditor(renderer);
    
    let lastTime = 0;
    function render(currentTime: number) {
        const deltaTime = (currentTime - lastTime) / 1000; // Convert to seconds
        lastTime = currentTime;
        
        inputController.update(deltaTime);
        objectEditor.checkForSelection();
        renderer.render();
        requestAnimationFrame(render);
    }

    requestAnimationFrame(render);
    debugLog.info('Render loop started with input controls');

    window.addEventListener('resize', () => {
        const newCanvasWidth = Math.floor(window.innerWidth * 0.7);
        const newCanvasHeight = window.innerHeight;
        
        canvas.width = newCanvasWidth;
        canvas.height = newCanvasHeight;
        renderer.resize(newCanvasWidth, newCanvasHeight);
        
        debugLog.info(`Window resized: ${newCanvasWidth}x${newCanvasHeight}`);
    });
}

window.addEventListener('DOMContentLoaded', main);