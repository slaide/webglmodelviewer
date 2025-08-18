import { mat4, vec3 } from 'gl-matrix';
import { Cube } from './geometry/cube';
import { ShaderProgram } from './shaders/shader-program';
import { Camera } from './camera';
import { Light, SceneLight, LightType } from './lighting';
import { debugLog } from './debug-logger';
import { SceneObject } from './scene-object';
import { SceneNode } from './scene-node';
import { Drawable } from './drawable';
import { RayCaster } from './ray-casting';
import { WireframeBox } from './geometry/wireframe-box';
import { wireframeVertexShader, wireframeFragmentShader } from './shaders/wireframe-shader';
import { SceneAST, deserializeScene, serializeScene } from './scene-io';

export class WebGLRenderer {
    private gl: WebGL2RenderingContext;
    private shaderProgram!: ShaderProgram;
    private wireframeShaderProgram!: ShaderProgram;
    private camera!: Camera;
    private lights: Light[] = [];
    private sceneObjects: SceneObject[] = []; // Keep for backward compatibility
    private sceneRoot: SceneNode = new SceneNode('root', 'Scene Root');
    private selectedObject: SceneObject | null = null;
    private hoveredObject: SceneObject | null = null;
    private selectedLight: SceneLight | null = null;
    private wireframeBox!: WireframeBox;
    private showBoundingBoxes = true;
    private showObjects = true;

    constructor(private canvas: HTMLCanvasElement) {
        const gl = canvas.getContext('webgl2');
        if (!gl) {
            throw new Error('WebGL2 not supported');
        }
        this.gl = gl;
    }

    initialize(): boolean {
        try {
            this.gl.enable(this.gl.DEPTH_TEST);
            this.gl.clearColor(0.1, 0.1, 0.2, 1.0);

            this.shaderProgram = new ShaderProgram(this.gl);
            this.wireframeShaderProgram = new ShaderProgram(this.gl);
            this.wireframeShaderProgram.createProgram(wireframeVertexShader, wireframeFragmentShader);
            
            const aspectRatio = this.canvas.width / this.canvas.height;
            debugLog.info(`Initial aspect ratio: ${aspectRatio.toFixed(3)} (${this.canvas.width}x${this.canvas.height})`);
            this.camera = new Camera(aspectRatio);

            this.wireframeBox = new WireframeBox(this.gl);

            this.setupLights();
            this.setupScene();

            return true;
        } catch (error) {
            console.error('Initialization failed:', error);
            return false;
        }
    }

    private setupLights() {
        this.lights = [
            new Light(vec3.fromValues(2, 2, 2), vec3.fromValues(1, 0.8, 0.6)),
            new Light(vec3.fromValues(-2, 1, 1), vec3.fromValues(0.6, 0.8, 1)),
            new Light(vec3.fromValues(0, -1, 2), vec3.fromValues(0.8, 1, 0.8))
        ];
        debugLog.info(`Setup ${this.lights.length} lights`);
    }

    private setupScene() {
        // Create a hierarchical scene with some parent-child relationships
        const cube1 = new SceneObject('cube1', 'Main Cube', new Cube(this.gl));
        cube1.position = vec3.fromValues(0, 0, 0);
        cube1.material.color = vec3.fromValues(0.8, 0.6, 0.4);

        const cube2 = new SceneObject('cube2', 'Child Cube 1', new Cube(this.gl));
        cube2.position = vec3.fromValues(3, 0, 0);
        cube2.material.color = vec3.fromValues(0.4, 0.8, 0.6);

        const cube3 = new SceneObject('cube3', 'Child Cube 2', new Cube(this.gl));
        cube3.position = vec3.fromValues(-3, 0, 0);
        cube3.material.color = vec3.fromValues(0.6, 0.4, 0.8);

        // Create a group node (non-drawable container)
        const group = new SceneNode('group1', 'Cube Group');
        group.transform.setPosition(0, 2, 0);

        const groupedCube = new SceneObject('cube4', 'Grouped Cube', new Cube(this.gl));
        groupedCube.position = vec3.fromValues(0, 0, 0); // Relative to group
        groupedCube.material.color = vec3.fromValues(0.8, 0.4, 0.8);

        // Create scene lights as objects
        const mainLight = new SceneLight('light1', 'Main Light', LightType.POINT);
        mainLight.transform.setPosition(2, 2, 2);
        mainLight.setColor(1, 0.8, 0.6);
        mainLight.setIntensity(1.0);

        const fillLight = new SceneLight('light2', 'Fill Light', LightType.POINT);
        fillLight.transform.setPosition(-2, 1, 1);
        fillLight.setColor(0.6, 0.8, 1);
        fillLight.setIntensity(0.8);

        const accentLight = new SceneLight('light3', 'Accent Light', LightType.DIRECTIONAL);
        accentLight.transform.setPosition(0, 5, 2);
        accentLight.setDirection(0, -1, -0.3);
        accentLight.setColor(0.8, 1, 0.8);
        accentLight.setIntensity(0.6);

        // Build hierarchy
        this.sceneRoot.addChild(cube1);
        this.sceneRoot.addChild(cube2);
        this.sceneRoot.addChild(cube3);
        this.sceneRoot.addChild(group);
        group.addChild(groupedCube);
        
        // Add lights to scene
        this.sceneRoot.addChild(mainLight);
        this.sceneRoot.addChild(fillLight);
        this.sceneRoot.addChild(accentLight);

        // Keep backward compatibility
        this.sceneObjects = [cube1, cube2, cube3, groupedCube];
        debugLog.info(`Setup ${this.sceneObjects.length} scene objects in hierarchical tree with lights`);
        debugLog.info(`Scene tree:\n${this.printSceneTree()}`);
    }

    // Scene serialization
    exportSceneAST(): SceneAST {
        return serializeScene(this.sceneRoot);
    }

    importSceneAST(ast: SceneAST) {
        // Clear current scene children
        // Keep the root node object
        const children = this.sceneRoot.getChildren();
        for (const child of children) {
            child.removeFromParent();
        }
        this.sceneObjects = [];
        this.selectedObject = null;
        this.selectedLight = null;

        const newRoot = deserializeScene(this.gl, ast);
        // Move newRoot's children under existing sceneRoot to preserve reference
        for (const child of newRoot.getChildren()) {
            this.sceneRoot.addChild(child);
        }

        // Rebuild sceneObjects array (drawable objects only)
        this.sceneRoot.traverse((node) => {
            if (node instanceof SceneObject) {
                this.sceneObjects.push(node);
            }
        });
        
        debugLog.info('Imported scene AST and rebuilt scene graph.');
    }

    render() {
        this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT);

        // Render objects if enabled
        if (this.showObjects) {
            this.shaderProgram.use();
            this.shaderProgram.setMatrix4('u_view', this.camera.getViewMatrix());
            this.shaderProgram.setMatrix4('u_projection', this.camera.getProjectionMatrix());
            this.shaderProgram.setVector3('u_viewPos', this.camera.position);

            // Collect lights from scene tree
            const sceneLights: SceneLight[] = [];
            this.sceneRoot.traverse((node) => {
                if (node instanceof SceneLight && node.enabled) {
                    sceneLights.push(node);
                }
            });

            // Set light uniforms (up to 3 lights for now)
            const maxLights = Math.min(3, sceneLights.length);
            for (let i = 0; i < maxLights; i++) {
                const light = sceneLights[i];
                const worldPos = light.getWorldPosition();
                const finalColor = vec3.create();
                vec3.scale(finalColor, light.lightData.color, light.lightData.intensity);
                
                this.shaderProgram.setVector3(`u_lights[${i}].position`, worldPos);
                this.shaderProgram.setVector3(`u_lights[${i}].color`, finalColor);
            }
            
            // Clear unused light slots
            for (let i = maxLights; i < 3; i++) {
                this.shaderProgram.setVector3(`u_lights[${i}].position`, vec3.fromValues(0, 0, 0));
                this.shaderProgram.setVector3(`u_lights[${i}].color`, vec3.fromValues(0, 0, 0));
            }

            // Render all drawable objects in the scene tree
            this.sceneRoot.traverseDrawable((node: SceneNode, drawable: Drawable) => {
                // Set object-specific uniforms
                this.shaderProgram.setMatrix4('u_model', node.getWorldMatrix());
                this.shaderProgram.setVector3('u_material.color', drawable.material.color);
                this.shaderProgram.setFloat('u_material.ambient', drawable.material.ambient);
                this.shaderProgram.setFloat('u_material.diffuse', drawable.material.diffuse);
                this.shaderProgram.setFloat('u_material.specular', drawable.material.specular);
                this.shaderProgram.setFloat('u_material.shininess', drawable.material.shininess);

                drawable.render();
            });
        }

        // Render bounding boxes if enabled
        if (this.showBoundingBoxes) {
            this.gl.disable(this.gl.DEPTH_TEST);
            this.wireframeShaderProgram.use();
            this.wireframeShaderProgram.setMatrix4('uViewMatrix', this.camera.getViewMatrix());
            this.wireframeShaderProgram.setMatrix4('uProjectionMatrix', this.camera.getProjectionMatrix());

            // Render bounding boxes for selected and hovered objects
            this.sceneRoot.traverse((node: SceneNode) => {
                if (node instanceof SceneObject && node.drawable) {
                    let shouldRender = false;
                    let color = vec3.fromValues(1, 1, 0); // Default yellow
                    
                    if (node.selected) {
                        shouldRender = true;
                        color = vec3.fromValues(1, 1, 0); // Yellow for selected
                    } else if (this.hoveredObject === node) {
                        shouldRender = true;
                        color = vec3.fromValues(0, 1, 1); // Cyan for hovered
                    }
                    
                    if (shouldRender) {
                        // Use local bounding box with object's world matrix
                        this.wireframeBox.initialize(node.boundingBox);
                        
                        // Apply the object's transformation to the wireframe
                        this.wireframeShaderProgram.setMatrix4('uModelMatrix', node.getWorldMatrix());
                        this.wireframeShaderProgram.setVector3('uColor', color);

                        this.wireframeBox.render();
                    }
                }
            }, true);

            // Render a small gizmo for selected light (wireframe cube at light position)
            if (this.selectedLight) {
                const gizmoMin = vec3.fromValues(-0.5, -0.5, -0.5);
                const gizmoMax = vec3.fromValues(0.5, 0.5, 0.5);
                this.wireframeBox.initialize({ min: gizmoMin, max: gizmoMax });

                const model = mat4.create();
                const pos = this.selectedLight.getWorldPosition();
                const scale = 0.2; // Light gizmo size
                mat4.fromTranslation(model, pos);
                mat4.scale(model, model, vec3.fromValues(scale, scale, scale));

                this.wireframeShaderProgram.setMatrix4('uModelMatrix', model);
                this.wireframeShaderProgram.setVector3('uColor', vec3.fromValues(1, 1, 0)); // Yellow
                this.wireframeBox.render();
            }
            this.gl.enable(this.gl.DEPTH_TEST);
        }
    }

    resize(width: number, height: number) {
        const aspectRatio = width / height;
        debugLog.info(`Resize: ${width}x${height}, aspect ratio: ${aspectRatio.toFixed(3)}`);
        this.gl.viewport(0, 0, width, height);
        this.camera.setAspectRatio(aspectRatio);
    }

    getCamera(): Camera {
        return this.camera;
    }

    getGLContext(): WebGL2RenderingContext {
        return this.gl;
    }

    selectObjectAt(x: number, y: number, canvasWidth?: number, canvasHeight?: number): SceneObject | null {
        const width = canvasWidth || this.canvas.width;
        const height = canvasHeight || this.canvas.height;
        const selectedObject = RayCaster.selectObject(x, y, width, height, this.camera, this.sceneObjects);
        
        // Use the new selection method
        this.setSelectedObject(selectedObject);
        
        if (this.selectedObject) {
            debugLog.info(`Selected: ${this.selectedObject.name}`);
        } else {
            debugLog.info('No object selected');
        }
        
        return this.selectedObject;
    }

    getSelectedObject(): SceneObject | null {
        return this.selectedObject;
    }

    getSceneObjects(): SceneObject[] {
        return this.sceneObjects;
    }

    setShowBoundingBoxes(show: boolean) {
        this.showBoundingBoxes = show;
    }

    setShowObjects(show: boolean) {
        this.showObjects = show;
    }

    // Scene tree management methods
    getSceneRoot(): SceneNode {
        return this.sceneRoot;
    }

    addToScene(node: SceneNode): void {
        this.sceneRoot.addChild(node);
        
        // Update backward compatibility array if it's a SceneObject
        if (node instanceof SceneObject) {
            this.sceneObjects.push(node);
        }
    }

    // Add a node under a specific parent and register drawables
    addNodeTo(parent: SceneNode, node: SceneNode): void {
        parent.addChild(node);
        if (node instanceof SceneObject) {
            this.sceneObjects.push(node);
        }
    }

    removeFromScene(node: SceneNode): void {
        node.removeFromParent();
        
        // Update backward compatibility array if it's a SceneObject
        if (node instanceof SceneObject) {
            const index = this.sceneObjects.indexOf(node);
            if (index !== -1) {
                this.sceneObjects.splice(index, 1);
            }
        }
    }

    findNodeById(id: string): SceneNode | null {
        let foundNode: SceneNode | null = null;
        this.sceneRoot.traverse((node) => {
            if (node.id === id) {
                foundNode = node;
            }
        });
        return foundNode;
    }

    findNodeByName(name: string): SceneNode | null {
        let foundNode: SceneNode | null = null;
        this.sceneRoot.traverse((node) => {
            if (node.name === name) {
                foundNode = node;
            }
        });
        return foundNode;
    }

    // Selection management
    clearAllSelections(): void {
        this.sceneRoot.traverse((node) => {
            if (node instanceof SceneObject) {
                node.selected = false;
            }
        });
        this.selectedObject = null;
    }

    setSelectedObject(obj: SceneObject | null): void {
        this.clearAllSelections();
        if (obj) {
            obj.selected = true;
            this.selectedObject = obj;
        }
    }

    // Light selection (for visual gizmo)
    setSelectedLight(light: SceneLight | null): void {
        this.selectedLight = light;
    }

    // Hover management
    setHoveredObject(obj: SceneObject | null): void {
        this.hoveredObject = obj;
    }

    getHoveredObject(): SceneObject | null {
        return this.hoveredObject;
    }

    // Debug method to print the scene tree
    printSceneTree(): string {
        return this.sceneRoot.printTree();
    }
}
