import { SceneObject } from './scene-object';
import { SceneNode } from './scene-node';
import { SceneLight, LightType } from './lighting';
import { WebGLRenderer } from './renderer';
import { debugLog } from './debug-logger';

export class ObjectEditor {
    private currentNode: SceneNode | null = null;
    private nameEditOriginal: string | null = null;

    constructor(private renderer: WebGLRenderer) {
        this.setupControls();
        debugLog.info('Object editor initialized');
    }

    private setupControls() {
        this.setupNameControl();
        this.setupTransformControls();
        this.setupMaterialControls();
        this.setupLightControls();
    }

    private setupNameControl() {
        const header = document.getElementById('object-name') as HTMLElement | null;
        if (!header) return;
        // ensure editable
        header.setAttribute('contenteditable', 'true');

        const commit = () => {
            if (!this.currentNode || !header) return;
            const newName = (header.textContent || '').trim();
            this.currentNode.name = newName;
            header.textContent = newName || 'Selected Object';
            document.dispatchEvent(new CustomEvent('scene-node-renamed', {
                detail: { id: this.currentNode.id, name: newName }
            }));
            this.nameEditOriginal = newName;
        };

        const cancel = () => {
            if (!this.currentNode || !header) return;
            const original = this.nameEditOriginal ?? this.currentNode.name;
            header.textContent = original || 'Selected Object';
        };

        header.addEventListener('focus', () => {
            this.nameEditOriginal = this.currentNode ? this.currentNode.name : '';
        });
        header.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.key === 'Enter') {
                e.preventDefault(); // prevent newline in contenteditable
                commit();
                (e.target as HTMLElement).blur();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                cancel();
                (e.target as HTMLElement).blur();
            }
        });
        header.addEventListener('blur', () => {
            commit();
        });
    }

    private setupTransformControls() {
        // Transform controls - available for all node types
        const posX = document.getElementById('pos-x') as HTMLInputElement;
        const posY = document.getElementById('pos-y') as HTMLInputElement;
        const posZ = document.getElementById('pos-z') as HTMLInputElement;
        const rotX = document.getElementById('rot-x') as HTMLInputElement;
        const rotY = document.getElementById('rot-y') as HTMLInputElement;
        const rotZ = document.getElementById('rot-z') as HTMLInputElement;
        const scaleX = document.getElementById('scale-x') as HTMLInputElement;
        const scaleY = document.getElementById('scale-y') as HTMLInputElement;
        const scaleZ = document.getElementById('scale-z') as HTMLInputElement;

        // Position event listeners
        [posX, posY, posZ].forEach((input, index) => {
            input?.addEventListener('input', () => {
                if (this.currentNode) {
                    this.currentNode.transform.position[index] = parseFloat(input.value) || 0;
                    this.currentNode.transform.markDirty();
                    this.currentNode.markWorldMatrixDirty();
                    debugLog.info(`Position updated: ${this.currentNode.transform.position}`);
                }
            });
        });

        // Rotation event listeners (convert degrees to radians)
        [rotX, rotY, rotZ].forEach((input, index) => {
            input?.addEventListener('input', () => {
                if (this.currentNode) {
                    this.currentNode.transform.rotation[index] = (parseFloat(input.value) || 0) * Math.PI / 180;
                    this.currentNode.transform.markDirty();
                    this.currentNode.markWorldMatrixDirty();
                    debugLog.info(`Rotation updated: ${Array.from(this.currentNode.transform.rotation).map(r => r * 180 / Math.PI)}`);
                }
            });
        });

        // Scale event listeners
        [scaleX, scaleY, scaleZ].forEach((input, index) => {
            input?.addEventListener('input', () => {
                if (this.currentNode) {
                    this.currentNode.transform.scale[index] = parseFloat(input.value) || 1;
                    this.currentNode.transform.markDirty();
                    this.currentNode.markWorldMatrixDirty();
                    debugLog.info(`Scale updated: ${this.currentNode.transform.scale}`);
                }
            });
        });
    }

    private setupMaterialControls() {
        // Material controls - only for SceneObjects with drawables
        const colorPicker = document.getElementById('color-picker') as HTMLInputElement;
        const wireframeMode = document.getElementById('wireframe-mode') as HTMLInputElement;
        const ambient = document.getElementById('ambient') as HTMLInputElement;
        const diffuse = document.getElementById('diffuse') as HTMLInputElement;
        const specular = document.getElementById('specular') as HTMLInputElement;
        const shininess = document.getElementById('shininess') as HTMLInputElement;

        // Value display elements
        const ambientValue = document.getElementById('ambient-value') as HTMLSpanElement;
        const diffuseValue = document.getElementById('diffuse-value') as HTMLSpanElement;
        const specularValue = document.getElementById('specular-value') as HTMLSpanElement;
        const shininessValue = document.getElementById('shininess-value') as HTMLSpanElement;

        // Color picker event listener
        colorPicker?.addEventListener('input', () => {
            const sceneObject = this.currentNode instanceof SceneObject ? this.currentNode : null;
            if (sceneObject && sceneObject.drawable) {
                const hexColor = colorPicker.value;
                const rgb = this.hexToRgb(hexColor);
                if (rgb) {
                    sceneObject.material.color[0] = rgb.r / 255;
                    sceneObject.material.color[1] = rgb.g / 255;
                    sceneObject.material.color[2] = rgb.b / 255;
                    debugLog.info(`Color updated: ${sceneObject.material.color}`);
                }
            }
        });

        // Wireframe mode toggle
        wireframeMode?.addEventListener('change', () => {
            const sceneObject = this.currentNode instanceof SceneObject ? this.currentNode : null;
            if (sceneObject && sceneObject.drawable) {
                sceneObject.drawable.wireframe = wireframeMode.checked;
                debugLog.info(`Wireframe mode: ${wireframeMode.checked}`);
            }
        });

        // Material property event listeners
        ambient?.addEventListener('input', () => {
            const sceneObject = this.currentNode instanceof SceneObject ? this.currentNode : null;
            if (sceneObject) {
                sceneObject.material.ambient = parseFloat(ambient.value);
                if (ambientValue) ambientValue.textContent = ambient.value;
            }
        });

        diffuse?.addEventListener('input', () => {
            const sceneObject = this.currentNode instanceof SceneObject ? this.currentNode : null;
            if (sceneObject) {
                sceneObject.material.diffuse = parseFloat(diffuse.value);
                if (diffuseValue) diffuseValue.textContent = diffuse.value;
            }
        });

        specular?.addEventListener('input', () => {
            const sceneObject = this.currentNode instanceof SceneObject ? this.currentNode : null;
            if (sceneObject) {
                sceneObject.material.specular = parseFloat(specular.value);
                if (specularValue) specularValue.textContent = specular.value;
            }
        });

        shininess?.addEventListener('input', () => {
            const sceneObject = this.currentNode instanceof SceneObject ? this.currentNode : null;
            if (sceneObject) {
                // Convert slider value (0-8) to exponential shininess (1-256)
                const sliderValue = parseFloat(shininess.value);
                const exponentialShininess = Math.pow(2, sliderValue);
                sceneObject.material.shininess = exponentialShininess;
                if (shininessValue) shininessValue.textContent = exponentialShininess.toFixed(1);
            }
        });
    }

    private setupLightControls() {
        // Light controls - only for SceneLight objects
        const lightType = document.getElementById('light-type') as HTMLSelectElement;
        const lightColor = document.getElementById('light-color') as HTMLInputElement;
        const lightIntensity = document.getElementById('light-intensity') as HTMLInputElement;
        const lightRange = document.getElementById('light-range') as HTMLInputElement;
        const lightDirX = document.getElementById('light-dir-x') as HTMLInputElement;
        const lightDirY = document.getElementById('light-dir-y') as HTMLInputElement;
        const lightDirZ = document.getElementById('light-dir-z') as HTMLInputElement;
        const lightInnerAngle = document.getElementById('light-inner-angle') as HTMLInputElement;
        const lightOuterAngle = document.getElementById('light-outer-angle') as HTMLInputElement;
        
        // Value display elements
        const lightIntensityValue = document.getElementById('light-intensity-value') as HTMLSpanElement;
        const lightRangeValue = document.getElementById('light-range-value') as HTMLSpanElement;
        const lightInnerAngleValue = document.getElementById('light-inner-angle-value') as HTMLSpanElement;
        const lightOuterAngleValue = document.getElementById('light-outer-angle-value') as HTMLSpanElement;

        // Light type change
        lightType?.addEventListener('change', () => {
            const sceneLight = this.currentNode instanceof SceneLight ? this.currentNode : null;
            if (sceneLight) {
                sceneLight.setLightType(lightType.value as LightType);
                this.updateLightControlsVisibility(lightType.value as LightType);
                debugLog.info(`Light type changed to: ${lightType.value}`);
            }
        });

        // Light color
        lightColor?.addEventListener('input', () => {
            const sceneLight = this.currentNode instanceof SceneLight ? this.currentNode : null;
            if (sceneLight) {
                const hexColor = lightColor.value;
                const rgb = this.hexToRgb(hexColor);
                if (rgb) {
                    sceneLight.setColor(rgb.r / 255, rgb.g / 255, rgb.b / 255);
                    debugLog.info(`Light color updated: ${sceneLight.lightData.color}`);
                }
            }
        });

        // Light intensity
        lightIntensity?.addEventListener('input', () => {
            const sceneLight = this.currentNode instanceof SceneLight ? this.currentNode : null;
            if (sceneLight) {
                sceneLight.setIntensity(parseFloat(lightIntensity.value));
                if (lightIntensityValue) lightIntensityValue.textContent = lightIntensity.value;
                debugLog.info(`Light intensity: ${lightIntensity.value}`);
            }
        });

        // Light range
        lightRange?.addEventListener('input', () => {
            const sceneLight = this.currentNode instanceof SceneLight ? this.currentNode : null;
            if (sceneLight) {
                sceneLight.setRange(parseFloat(lightRange.value));
                if (lightRangeValue) lightRangeValue.textContent = lightRange.value;
            }
        });

        // Light direction
        [lightDirX, lightDirY, lightDirZ].forEach((input, index) => {
            input?.addEventListener('input', () => {
                const sceneLight = this.currentNode instanceof SceneLight ? this.currentNode : null;
                if (sceneLight) {
                    const x = parseFloat(lightDirX.value) || 0;
                    const y = parseFloat(lightDirY.value) || -1;
                    const z = parseFloat(lightDirZ.value) || 0;
                    sceneLight.setDirection(x, y, z);
                    debugLog.info(`Light direction: ${x}, ${y}, ${z}`);
                }
            });
        });

        // Spot light angles
        lightInnerAngle?.addEventListener('input', () => {
            const sceneLight = this.currentNode instanceof SceneLight ? this.currentNode : null;
            if (sceneLight) {
                const inner = parseFloat(lightInnerAngle.value);
                const outer = parseFloat(lightOuterAngle.value);
                sceneLight.setSpotAngles(inner, outer);
                if (lightInnerAngleValue) lightInnerAngleValue.textContent = inner + '°';
            }
        });

        lightOuterAngle?.addEventListener('input', () => {
            const sceneLight = this.currentNode instanceof SceneLight ? this.currentNode : null;
            if (sceneLight) {
                const inner = parseFloat(lightInnerAngle.value);
                const outer = parseFloat(lightOuterAngle.value);
                sceneLight.setSpotAngles(inner, outer);
                if (lightOuterAngleValue) lightOuterAngleValue.textContent = outer + '°';
            }
        });
    }

    setSelectedObject(node: SceneNode | null) {
        this.currentNode = node;
        
        const noSelection = document.getElementById('no-selection');
        const objectEditor = document.getElementById('object-editor');
        
        debugLog.info(`ObjectEditor.setSelectedObject called with: ${node ? `${node.name} (${node.constructor.name})` : 'null'}`);
        
        if (node) {
            debugLog.info('Showing object editor, hiding no-selection');
            if (noSelection) {
                noSelection.style.display = 'none';
                debugLog.info('no-selection hidden');
            } else {
                debugLog.error('no-selection element not found');
            }
            if (objectEditor) {
                objectEditor.style.display = 'block';
                debugLog.info('object-editor shown');
            } else {
                debugLog.error('object-editor element not found');
            }
            this.updateControls(node);
        } else {
            debugLog.info('Hiding object editor, showing no-selection');
            if (noSelection) noSelection.style.display = 'block';
            if (objectEditor) objectEditor.style.display = 'none';
        }
    }

    private updateLightControlsVisibility(lightType: LightType) {
        const rangeControl = document.getElementById('light-range-control');
        const directionControl = document.getElementById('light-direction-control');
        const directionInputs = document.getElementById('light-direction-inputs');
        const spotControls = document.getElementById('light-spot-controls');

        // Hide all first
        if (rangeControl) rangeControl.style.display = 'none';
        if (directionControl) directionControl.style.display = 'none';
        if (directionInputs) directionInputs.style.display = 'none';
        if (spotControls) spotControls.style.display = 'none';

        // Show relevant controls based on light type
        switch (lightType) {
            case LightType.POINT:
                if (rangeControl) rangeControl.style.display = 'flex';
                break;
            case LightType.DIRECTIONAL:
                if (directionControl) directionControl.style.display = 'flex';
                if (directionInputs) directionInputs.style.display = 'flex';
                break;
            case LightType.SPOT:
                if (rangeControl) rangeControl.style.display = 'flex';
                if (directionControl) directionControl.style.display = 'flex';
                if (directionInputs) directionInputs.style.display = 'flex';
                if (spotControls) spotControls.style.display = 'block';
                break;
        }
    }

    private updateControls(node: SceneNode) {
        debugLog.info(`updateControls called for: ${node.name} (${node.constructor.name})`);
        
        const objectName = document.getElementById('object-name') as HTMLElement;
        if (objectName) {
            objectName.textContent = node.name;
            debugLog.info(`Updated object name to: ${node.name}`);
            this.nameEditOriginal = node.name;
        } else {
            debugLog.error('object-name element not found');
        }

        // Show/hide property panels based on node type
        this.updatePropertyPanelsVisibility(node);

        // Update transform controls (available for all nodes)
        debugLog.info('Updating transform controls');
        this.updateTransformControls(node);

        // Update specific property controls based on node type
        if (node instanceof SceneObject) {
            debugLog.info('Updating material controls for SceneObject');
            this.updateMaterialControls(node);
            // Update mesh info if available
            const meshInfo = document.getElementById('mesh-info') as HTMLElement | null;
            const vSpan = document.getElementById('mesh-vertices') as HTMLElement | null;
            const fSpan = document.getElementById('mesh-faces') as HTMLElement | null;
            const stats = node.geometry && (node.geometry as any).getStats ? (node.geometry as any).getStats() : null;
            if (meshInfo) {
                if (stats && typeof stats.vertices === 'number' && typeof stats.faces === 'number') {
                    meshInfo.style.display = 'block';
                    if (vSpan) vSpan.textContent = String(stats.vertices);
                    if (fSpan) fSpan.textContent = String(stats.faces);
                } else {
                    meshInfo.style.display = 'none';
                }
            }
        } else if (node instanceof SceneLight) {
            debugLog.info('Updating light controls for SceneLight');
            this.updateLightControls(node);
            const meshInfo = document.getElementById('mesh-info') as HTMLElement | null;
            if (meshInfo) meshInfo.style.display = 'none';
        } else {
            debugLog.info('No additional controls for plain SceneNode');
            const meshInfo = document.getElementById('mesh-info') as HTMLElement | null;
            if (meshInfo) meshInfo.style.display = 'none';
        }
    }

    private updatePropertyPanelsVisibility(node: SceneNode) {
        // Get the material properties panel (the one with color picker, wireframe, etc.)
        // This is the second .control-group in the object editor
        const colorPicker = document.getElementById('color-picker');
        const materialPropertiesPanel = colorPicker?.closest('.control-group') as HTMLElement;
        const lightPropertiesPanel = document.getElementById('light-properties') as HTMLElement;

        debugLog.info(`Updating property panels for ${node.constructor.name}`);
        debugLog.info(`Material panel found: ${!!materialPropertiesPanel}, Light panel found: ${!!lightPropertiesPanel}`);

        // Hide optional panels first
        if (materialPropertiesPanel) {
            materialPropertiesPanel.style.display = 'none';
            debugLog.info('Hidden material properties panel');
        }
        if (lightPropertiesPanel) {
            lightPropertiesPanel.style.display = 'none';
            debugLog.info('Hidden light properties panel');
        }

        // Show relevant panels based on node type
        if (node instanceof SceneObject && node.hasDrawable()) {
            // Show material properties for drawable objects
            if (materialPropertiesPanel) {
                materialPropertiesPanel.style.display = 'block';
                debugLog.info('Showing material properties for SceneObject with drawable');
            }
        } else if (node instanceof SceneLight) {
            // Show light properties for lights
            if (lightPropertiesPanel) {
                lightPropertiesPanel.style.display = 'block';
                debugLog.info('Showing light properties for SceneLight');
            }
        } else {
            debugLog.info('Plain SceneNode - only transform controls should be visible');
        }
        // For plain SceneNodes, only transform controls are shown (they're always visible)
    }

    private updateTransformControls(node: SceneNode) {
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

        if (posX) posX.value = node.transform.position[0].toFixed(1);
        if (posY) posY.value = node.transform.position[1].toFixed(1);
        if (posZ) posZ.value = node.transform.position[2].toFixed(1);
        if (rotX) rotX.value = (node.transform.rotation[0] * 180 / Math.PI).toFixed(1);
        if (rotY) rotY.value = (node.transform.rotation[1] * 180 / Math.PI).toFixed(1);
        if (rotZ) rotZ.value = (node.transform.rotation[2] * 180 / Math.PI).toFixed(1);
        if (scaleX) scaleX.value = node.transform.scale[0].toFixed(1);
        if (scaleY) scaleY.value = node.transform.scale[1].toFixed(1);
        if (scaleZ) scaleZ.value = node.transform.scale[2].toFixed(1);
    }

    private updateMaterialControls(obj: SceneObject) {
        // Update material controls
        const colorPicker = document.getElementById('color-picker') as HTMLInputElement;
        const wireframeMode = document.getElementById('wireframe-mode') as HTMLInputElement;
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
        if (wireframeMode) {
            wireframeMode.checked = obj.drawable?.wireframe || false;
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

    private updateLightControls(light: SceneLight) {
        const lightType = document.getElementById('light-type') as HTMLSelectElement;
        const lightColor = document.getElementById('light-color') as HTMLInputElement;
        const lightIntensity = document.getElementById('light-intensity') as HTMLInputElement;
        const lightRange = document.getElementById('light-range') as HTMLInputElement;
        const lightDirX = document.getElementById('light-dir-x') as HTMLInputElement;
        const lightDirY = document.getElementById('light-dir-y') as HTMLInputElement;
        const lightDirZ = document.getElementById('light-dir-z') as HTMLInputElement;
        const lightInnerAngle = document.getElementById('light-inner-angle') as HTMLInputElement;
        const lightOuterAngle = document.getElementById('light-outer-angle') as HTMLInputElement;
        
        // Value display elements
        const lightIntensityValue = document.getElementById('light-intensity-value') as HTMLSpanElement;
        const lightRangeValue = document.getElementById('light-range-value') as HTMLSpanElement;
        const lightInnerAngleValue = document.getElementById('light-inner-angle-value') as HTMLSpanElement;
        const lightOuterAngleValue = document.getElementById('light-outer-angle-value') as HTMLSpanElement;

        // Update light type
        if (lightType) {
            lightType.value = light.lightData.type;
            this.updateLightControlsVisibility(light.lightData.type);
        }

        // Update light color
        if (lightColor) {
            const hexColor = this.rgbToHex(
                Math.round(light.lightData.color[0] * 255),
                Math.round(light.lightData.color[1] * 255),
                Math.round(light.lightData.color[2] * 255)
            );
            lightColor.value = hexColor;
        }

        // Update intensity
        if (lightIntensity) {
            lightIntensity.value = light.lightData.intensity.toString();
            if (lightIntensityValue) lightIntensityValue.textContent = light.lightData.intensity.toFixed(1);
        }

        // Update range
        if (lightRange && light.lightData.range) {
            lightRange.value = light.lightData.range.toString();
            if (lightRangeValue) lightRangeValue.textContent = light.lightData.range.toFixed(1);
        }

        // Update direction
        if (light.lightData.direction) {
            if (lightDirX) lightDirX.value = light.lightData.direction[0].toFixed(2);
            if (lightDirY) lightDirY.value = light.lightData.direction[1].toFixed(2);
            if (lightDirZ) lightDirZ.value = light.lightData.direction[2].toFixed(2);
        }

        // Update spot light angles
        if (light.lightData.innerConeAngle && lightInnerAngle) {
            const innerDegrees = (light.lightData.innerConeAngle * 180) / Math.PI;
            lightInnerAngle.value = innerDegrees.toString();
            if (lightInnerAngleValue) lightInnerAngleValue.textContent = innerDegrees.toFixed(0) + '°';
        }

        if (light.lightData.outerConeAngle && lightOuterAngle) {
            const outerDegrees = (light.lightData.outerConeAngle * 180) / Math.PI;
            lightOuterAngle.value = outerDegrees.toString();
            if (lightOuterAngleValue) lightOuterAngleValue.textContent = outerDegrees.toFixed(0) + '°';
        }
    }

    checkForSelection() {
        const rendererSelection = this.renderer.getSelectedObject();
        // Only sync from renderer if it has a concrete selection,
        // or if the current editor selection is a SceneObject that should
        // mirror renderer selection. Do NOT clear selection for lights/plain nodes.
        if (rendererSelection) {
            if (rendererSelection !== this.currentNode) {
                this.setSelectedObject(rendererSelection);
            }
        } else {
            // Renderer has no SceneObject selected. Only clear the editor
            // if the editor is currently showing a SceneObject.
            if (this.currentNode instanceof SceneObject) {
                this.setSelectedObject(null);
            }
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
