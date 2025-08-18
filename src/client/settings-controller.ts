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
        });

        mouseInvertYCheckbox?.addEventListener('change', (e) => {
            this.mouseInvertY = (e.target as HTMLInputElement).checked;
            this.inputController.setMouseInversion(this.mouseInvertX, this.mouseInvertY);
            debugLog.info(`Mouse Y invert: ${this.mouseInvertY}`);
        });

        // Touch inversion checkboxes
        const touchInvertXCheckbox = document.getElementById('touch-invert-x') as HTMLInputElement;
        const touchInvertYCheckbox = document.getElementById('touch-invert-y') as HTMLInputElement;
        
        touchInvertXCheckbox?.addEventListener('change', (e) => {
            this.touchInvertX = (e.target as HTMLInputElement).checked;
            this.inputController.setTouchInversion(this.touchInvertX, this.touchInvertY);
            debugLog.info(`Touch X invert: ${this.touchInvertX}`);
        });

        touchInvertYCheckbox?.addEventListener('change', (e) => {
            this.touchInvertY = (e.target as HTMLInputElement).checked;
            this.inputController.setTouchInversion(this.touchInvertX, this.touchInvertY);
            debugLog.info(`Touch Y invert: ${this.touchInvertY}`);
        });

        // Mouse sensitivity slider
        const mouseSensitivitySlider = document.getElementById('mouse-sensitivity') as HTMLInputElement;
        const sensitivityValue = document.getElementById('sensitivity-value') as HTMLSpanElement;
        
        mouseSensitivitySlider?.addEventListener('input', (e) => {
            const value = parseFloat((e.target as HTMLInputElement).value);
            this.camera.mouseSensitivity = value;
            if (sensitivityValue) sensitivityValue.textContent = value.toFixed(2);
            debugLog.info(`Mouse sensitivity: ${value.toFixed(2)}`);
        });

        // Movement speed slider
        const movementSpeedSlider = document.getElementById('movement-speed') as HTMLInputElement;
        const speedValue = document.getElementById('speed-value') as HTMLSpanElement;
        
        movementSpeedSlider?.addEventListener('input', (e) => {
            const value = parseFloat((e.target as HTMLInputElement).value);
            this.camera.movementSpeed = value;
            if (speedValue) speedValue.textContent = value.toFixed(1);
            debugLog.info(`Movement speed: ${value.toFixed(1)}`);
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
        });

        showObjectsCheckbox?.addEventListener('change', (e) => {
            this.showObjects = (e.target as HTMLInputElement).checked;
            if (this.renderer) {
                this.renderer.setShowObjects(this.showObjects);
            }
            debugLog.info(`Show objects: ${this.showObjects}`);
        });

        // Set initial values
        this.inputController.setMouseInversion(this.mouseInvertX, this.mouseInvertY);
        this.inputController.setTouchInversion(this.touchInvertX, this.touchInvertY);
        if (this.renderer) {
            this.renderer.setShowBoundingBoxes(this.showBoundingBoxes);
            this.renderer.setShowObjects(this.showObjects);
        }
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