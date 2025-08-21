import { InputController } from './input-controller';
import { Camera } from './camera';
import { debugLog } from './debug-logger';
import { WebGLRenderer } from './renderer';

export class SettingsController {
    private mouseInvertX = true;
    private mouseInvertY = true;
    private touchInvertX = false;
    private touchInvertY = false;
    private showBoundingBoxes = true;
    private showObjects = true;

    constructor(private inputController: InputController, private camera: Camera, private renderer?: WebGLRenderer) {
        this.setupControls();
        debugLog.info('Settings controller initialized');
    }

    private setupControls() {
        // Mouse inversion checkboxes
        const mouseInvertXCheckbox = document.getElementById('mouse-invert-x') as HTMLInputElement;
        const mouseInvertYCheckbox = document.getElementById('mouse-invert-y') as HTMLInputElement;
        
        mouseInvertXCheckbox?.addEventListener('change', (e) => {
            this.mouseInvertX = (e.target as HTMLInputElement).checked;
            this.inputController.setMouseInversion(this.mouseInvertX, this.mouseInvertY);
            debugLog.info(`Mouse X invert: ${this.mouseInvertX}`);
            this.emitChanged();
        });

        mouseInvertYCheckbox?.addEventListener('change', (e) => {
            this.mouseInvertY = (e.target as HTMLInputElement).checked;
            this.inputController.setMouseInversion(this.mouseInvertX, this.mouseInvertY);
            debugLog.info(`Mouse Y invert: ${this.mouseInvertY}`);
            this.emitChanged();
        });

        // Touch inversion checkboxes
        const touchInvertXCheckbox = document.getElementById('touch-invert-x') as HTMLInputElement;
        const touchInvertYCheckbox = document.getElementById('touch-invert-y') as HTMLInputElement;
        
        touchInvertXCheckbox?.addEventListener('change', (e) => {
            this.touchInvertX = (e.target as HTMLInputElement).checked;
            this.inputController.setTouchInversion(this.touchInvertX, this.touchInvertY);
            debugLog.info(`Touch X invert: ${this.touchInvertX}`);
            this.emitChanged();
        });

        touchInvertYCheckbox?.addEventListener('change', (e) => {
            this.touchInvertY = (e.target as HTMLInputElement).checked;
            this.inputController.setTouchInversion(this.touchInvertX, this.touchInvertY);
            debugLog.info(`Touch Y invert: ${this.touchInvertY}`);
            this.emitChanged();
        });

        // Mouse sensitivity slider
        const mouseSensitivitySlider = document.getElementById('mouse-sensitivity') as HTMLInputElement;
        const sensitivityValue = document.getElementById('sensitivity-value') as HTMLSpanElement;
        
        mouseSensitivitySlider?.addEventListener('input', (e) => {
            const value = parseFloat((e.target as HTMLInputElement).value);
            this.camera.mouseSensitivity = value;
            if (sensitivityValue) sensitivityValue.textContent = value.toFixed(2);
            debugLog.info(`Mouse sensitivity: ${value.toFixed(2)}`);
            this.emitChanged();
        });

        // Movement speed slider
        const movementSpeedSlider = document.getElementById('movement-speed') as HTMLInputElement;
        const speedValue = document.getElementById('speed-value') as HTMLSpanElement;
        
        movementSpeedSlider?.addEventListener('input', (e) => {
            const value = parseFloat((e.target as HTMLInputElement).value);
            this.camera.movementSpeed = value;
            if (speedValue) speedValue.textContent = value.toFixed(1);
            debugLog.info(`Movement speed: ${value.toFixed(1)}`);
            this.emitChanged();
        });

        // Bounding box display toggles
        const showBoundingBoxesCheckbox = document.getElementById('show-bounding-boxes') as HTMLInputElement;
        const showObjectsCheckbox = document.getElementById('show-objects') as HTMLInputElement;
        
        showBoundingBoxesCheckbox?.addEventListener('change', (e) => {
            this.showBoundingBoxes = (e.target as HTMLInputElement).checked;
            if (this.renderer) {
                this.renderer.setShowBoundingBoxes(this.showBoundingBoxes);
            }
            debugLog.info(`Show bounding boxes: ${this.showBoundingBoxes}`);
            this.emitChanged();
        });

        showObjectsCheckbox?.addEventListener('change', (e) => {
            this.showObjects = (e.target as HTMLInputElement).checked;
            if (this.renderer) {
                this.renderer.setShowObjects(this.showObjects);
            }
            debugLog.info(`Show objects: ${this.showObjects}`);
            this.emitChanged();
        });

        // Set initial values
        this.inputController.setMouseInversion(this.mouseInvertX, this.mouseInvertY);
        this.inputController.setTouchInversion(this.touchInvertX, this.touchInvertY);
        if (this.renderer) {
            this.renderer.setShowBoundingBoxes(this.showBoundingBoxes);
            this.renderer.setShowObjects(this.showObjects);
        }
    }


    getSettings() {
        return {
            mouseInvertX: this.mouseInvertX,
            mouseInvertY: this.mouseInvertY,
            touchInvertX: this.touchInvertX,
            touchInvertY: this.touchInvertY,
            mouseSensitivity: this.camera.mouseSensitivity,
            movementSpeed: this.camera.movementSpeed,
            showBoundingBoxes: this.showBoundingBoxes,
            showObjects: this.showObjects
        };
    }

    applySettings(s: any) {
        if (!s) return;
        const mouseInvertXCheckbox = document.getElementById('mouse-invert-x') as HTMLInputElement;
        const mouseInvertYCheckbox = document.getElementById('mouse-invert-y') as HTMLInputElement;
        const touchInvertXCheckbox = document.getElementById('touch-invert-x') as HTMLInputElement;
        const touchInvertYCheckbox = document.getElementById('touch-invert-y') as HTMLInputElement;
        const mouseSensitivitySlider = document.getElementById('mouse-sensitivity') as HTMLInputElement;
        const sensitivityValue = document.getElementById('sensitivity-value') as HTMLSpanElement;
        const movementSpeedSlider = document.getElementById('movement-speed') as HTMLInputElement;
        const speedValue = document.getElementById('speed-value') as HTMLSpanElement;
        const showBoundingBoxesCheckbox = document.getElementById('show-bounding-boxes') as HTMLInputElement;
        const showObjectsCheckbox = document.getElementById('show-objects') as HTMLInputElement;

        if (typeof s.mouseInvertX === 'boolean') { this.mouseInvertX = s.mouseInvertX; if (mouseInvertXCheckbox) mouseInvertXCheckbox.checked = s.mouseInvertX; }
        if (typeof s.mouseInvertY === 'boolean') { this.mouseInvertY = s.mouseInvertY; if (mouseInvertYCheckbox) mouseInvertYCheckbox.checked = s.mouseInvertY; }
        if (typeof s.touchInvertX === 'boolean') { this.touchInvertX = s.touchInvertX; if (touchInvertXCheckbox) touchInvertXCheckbox.checked = s.touchInvertX; }
        if (typeof s.touchInvertY === 'boolean') { this.touchInvertY = s.touchInvertY; if (touchInvertYCheckbox) touchInvertYCheckbox.checked = s.touchInvertY; }
        if (typeof s.mouseSensitivity === 'number') { this.camera.mouseSensitivity = s.mouseSensitivity; if (mouseSensitivitySlider) mouseSensitivitySlider.value = String(s.mouseSensitivity); if (sensitivityValue) sensitivityValue.textContent = s.mouseSensitivity.toFixed(2); }
        if (typeof s.movementSpeed === 'number') { this.camera.movementSpeed = s.movementSpeed; if (movementSpeedSlider) movementSpeedSlider.value = String(s.movementSpeed); if (speedValue) speedValue.textContent = s.movementSpeed.toFixed(1); }
        if (typeof s.showBoundingBoxes === 'boolean') { this.showBoundingBoxes = s.showBoundingBoxes; if (showBoundingBoxesCheckbox) showBoundingBoxesCheckbox.checked = s.showBoundingBoxes; if (this.renderer) this.renderer.setShowBoundingBoxes(this.showBoundingBoxes); }
        if (typeof s.showObjects === 'boolean') { this.showObjects = s.showObjects; if (showObjectsCheckbox) showObjectsCheckbox.checked = s.showObjects; if (this.renderer) this.renderer.setShowObjects(this.showObjects); }

        this.inputController.setMouseInversion(this.mouseInvertX, this.mouseInvertY);
        this.inputController.setTouchInversion(this.touchInvertX, this.touchInvertY);
        this.emitChanged();
    }

    private emitChanged() {
        const ev = new CustomEvent('app-settings-changed', { detail: this.getSettings() });
        document.dispatchEvent(ev);
    }

}

// Global function for tab switching
(window as any).switchTab = function(tabName: string) {
    // Hide all tab contents
    const tabContents = document.querySelectorAll('.tab-content');
    tabContents.forEach(content => content.classList.remove('active'));
    
    // Remove active class from all tab buttons
    const tabButtons = document.querySelectorAll('.tab-button');
    tabButtons.forEach(button => button.classList.remove('active'));
    
    // Show selected tab content
    const selectedTab = document.getElementById(`${tabName}-tab`);
    if (selectedTab) {
        selectedTab.classList.add('active');
    }
    
    // Activate selected tab button
    const selectedButton = event?.target as HTMLButtonElement;
    if (selectedButton) {
        selectedButton.classList.add('active');
    }
};