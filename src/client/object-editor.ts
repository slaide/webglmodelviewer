import { SceneObject } from './scene-object';
import { SceneNode } from './scene-node';
import { WebGLRenderer } from './renderer';
import { debugLog } from './debug-logger';

export class ObjectEditor {
    private currentObject: SceneObject | null = null;

    constructor(private renderer: WebGLRenderer) {
        this.setupControls();
        debugLog.info('Object editor initialized');
    }

    private setupControls() {
        // Transform controls
        const posX = document.getElementById('pos-x') as HTMLInputElement;
        const posY = document.getElementById('pos-y') as HTMLInputElement;
        const posZ = document.getElementById('pos-z') as HTMLInputElement;
        const rotX = document.getElementById('rot-x') as HTMLInputElement;
        const rotY = document.getElementById('rot-y') as HTMLInputElement;
        const rotZ = document.getElementById('rot-z') as HTMLInputElement;
        const scaleX = document.getElementById('scale-x') as HTMLInputElement;
        const scaleY = document.getElementById('scale-y') as HTMLInputElement;
        const scaleZ = document.getElementById('scale-z') as HTMLInputElement;

        // Material controls
        const colorPicker = document.getElementById('color-picker') as HTMLInputElement;
        const ambient = document.getElementById('ambient') as HTMLInputElement;
        const diffuse = document.getElementById('diffuse') as HTMLInputElement;
        const specular = document.getElementById('specular') as HTMLInputElement;
        const shininess = document.getElementById('shininess') as HTMLInputElement;

        // Value display elements
        const ambientValue = document.getElementById('ambient-value') as HTMLSpanElement;
        const diffuseValue = document.getElementById('diffuse-value') as HTMLSpanElement;
        const specularValue = document.getElementById('specular-value') as HTMLSpanElement;
        const shininessValue = document.getElementById('shininess-value') as HTMLSpanElement;

        // Position event listeners
        [posX, posY, posZ].forEach((input, index) => {
            input?.addEventListener('input', () => {
                if (this.currentObject) {
                    this.currentObject.position[index] = parseFloat(input.value) || 0;
                    this.currentObject.transform.markDirty();
                    this.currentObject.markWorldMatrixDirty();
                    debugLog.info(`Position updated: ${this.currentObject.position}`);
                }
            });
        });

        // Rotation event listeners (convert degrees to radians)
        [rotX, rotY, rotZ].forEach((input, index) => {
            input?.addEventListener('input', () => {
                if (this.currentObject) {
                    this.currentObject.rotation[index] = (parseFloat(input.value) || 0) * Math.PI / 180;
                    this.currentObject.transform.markDirty();
                    this.currentObject.markWorldMatrixDirty();
                    debugLog.info(`Rotation updated: ${Array.from(this.currentObject.rotation).map(r => r * 180 / Math.PI)}`);
                }
            });
        });

        // Scale event listeners
        [scaleX, scaleY, scaleZ].forEach((input, index) => {
            input?.addEventListener('input', () => {
                if (this.currentObject) {
                    this.currentObject.scale[index] = parseFloat(input.value) || 1;
                    this.currentObject.transform.markDirty();
                    this.currentObject.markWorldMatrixDirty();
                    debugLog.info(`Scale updated: ${this.currentObject.scale}`);
                }
            });
        });

        // Color picker event listener
        colorPicker?.addEventListener('input', () => {
            if (this.currentObject) {
                const hexColor = colorPicker.value;
                const rgb = this.hexToRgb(hexColor);
                if (rgb) {
                    this.currentObject.material.color[0] = rgb.r / 255;
                    this.currentObject.material.color[1] = rgb.g / 255;
                    this.currentObject.material.color[2] = rgb.b / 255;
                    debugLog.info(`Color updated: ${this.currentObject.material.color}`);
                }
            }
        });

        // Material property event listeners
        ambient?.addEventListener('input', () => {
            if (this.currentObject) {
                this.currentObject.material.ambient = parseFloat(ambient.value);
                if (ambientValue) ambientValue.textContent = ambient.value;
            }
        });

        diffuse?.addEventListener('input', () => {
            if (this.currentObject) {
                this.currentObject.material.diffuse = parseFloat(diffuse.value);
                if (diffuseValue) diffuseValue.textContent = diffuse.value;
            }
        });

        specular?.addEventListener('input', () => {
            if (this.currentObject) {
                this.currentObject.material.specular = parseFloat(specular.value);
                if (specularValue) specularValue.textContent = specular.value;
            }
        });

        shininess?.addEventListener('input', () => {
            if (this.currentObject) {
                // Convert slider value (0-8) to exponential shininess (1-256)
                const sliderValue = parseFloat(shininess.value);
                const exponentialShininess = Math.pow(2, sliderValue);
                this.currentObject.material.shininess = exponentialShininess;
                if (shininessValue) shininessValue.textContent = exponentialShininess.toFixed(1);
            }
        });
    }

    setSelectedObject(obj: SceneObject | null) {
        this.currentObject = obj;
        
        const noSelection = document.getElementById('no-selection');
        const objectEditor = document.getElementById('object-editor');
        
        if (obj) {
            if (noSelection) noSelection.style.display = 'none';
            if (objectEditor) objectEditor.style.display = 'block';
            this.updateControls(obj);
        } else {
            if (noSelection) noSelection.style.display = 'block';
            if (objectEditor) objectEditor.style.display = 'none';
        }
    }

    private updateControls(obj: SceneObject) {
        const objectName = document.getElementById('object-name') as HTMLElement;
        if (objectName) objectName.textContent = obj.name;

        // Update transform controls
        const posX = document.getElementById('pos-x') as HTMLInputElement;
        const posY = document.getElementById('pos-y') as HTMLInputElement;
        const posZ = document.getElementById('pos-z') as HTMLInputElement;
        const rotX = document.getElementById('rot-x') as HTMLInputElement;
        const rotY = document.getElementById('rot-y') as HTMLInputElement;
        const rotZ = document.getElementById('rot-z') as HTMLInputElement;
        const scaleX = document.getElementById('scale-x') as HTMLInputElement;
        const scaleY = document.getElementById('scale-y') as HTMLInputElement;
        const scaleZ = document.getElementById('scale-z') as HTMLInputElement;

        if (posX) posX.value = obj.position[0].toFixed(1);
        if (posY) posY.value = obj.position[1].toFixed(1);
        if (posZ) posZ.value = obj.position[2].toFixed(1);
        if (rotX) rotX.value = (obj.rotation[0] * 180 / Math.PI).toFixed(1);
        if (rotY) rotY.value = (obj.rotation[1] * 180 / Math.PI).toFixed(1);
        if (rotZ) rotZ.value = (obj.rotation[2] * 180 / Math.PI).toFixed(1);
        if (scaleX) scaleX.value = obj.scale[0].toFixed(1);
        if (scaleY) scaleY.value = obj.scale[1].toFixed(1);
        if (scaleZ) scaleZ.value = obj.scale[2].toFixed(1);

        // Update material controls
        const colorPicker = document.getElementById('color-picker') as HTMLInputElement;
        const ambient = document.getElementById('ambient') as HTMLInputElement;
        const diffuse = document.getElementById('diffuse') as HTMLInputElement;
        const specular = document.getElementById('specular') as HTMLInputElement;
        const shininess = document.getElementById('shininess') as HTMLInputElement;

        if (colorPicker) {
            const hexColor = this.rgbToHex(
                Math.round(obj.material.color[0] * 255),
                Math.round(obj.material.color[1] * 255),
                Math.round(obj.material.color[2] * 255)
            );
            colorPicker.value = hexColor;
        }
        if (ambient) ambient.value = obj.material.ambient.toFixed(2);
        if (diffuse) diffuse.value = obj.material.diffuse.toFixed(2);
        if (specular) specular.value = obj.material.specular.toFixed(2);
        if (shininess) {
            // Convert exponential shininess back to slider value (0-8)
            const sliderValue = Math.log2(Math.max(1, obj.material.shininess));
            shininess.value = sliderValue.toString();
        }

        // Update value displays
        const ambientValue = document.getElementById('ambient-value') as HTMLSpanElement;
        const diffuseValue = document.getElementById('diffuse-value') as HTMLSpanElement;
        const specularValue = document.getElementById('specular-value') as HTMLSpanElement;
        const shininessValue = document.getElementById('shininess-value') as HTMLSpanElement;

        if (ambientValue) ambientValue.textContent = obj.material.ambient.toFixed(2);
        if (diffuseValue) diffuseValue.textContent = obj.material.diffuse.toFixed(2);
        if (specularValue) specularValue.textContent = obj.material.specular.toFixed(2);
        if (shininessValue) shininessValue.textContent = obj.material.shininess.toFixed(1);
    }

    checkForSelection() {
        const selectedObject = this.renderer.getSelectedObject();
        if (selectedObject !== this.currentObject) {
            this.setSelectedObject(selectedObject);
        }
    }

    // Color conversion utilities
    private hexToRgb(hex: string): { r: number; g: number; b: number } | null {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
        } : null;
    }

    private rgbToHex(r: number, g: number, b: number): string {
        const componentToHex = (c: number): string => {
            const hex = Math.max(0, Math.min(255, c)).toString(16);
            return hex.length === 1 ? '0' + hex : hex;
        };
        return '#' + componentToHex(r) + componentToHex(g) + componentToHex(b);
    }
}