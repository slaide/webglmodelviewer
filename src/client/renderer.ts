import { mat4, vec3 } from 'gl-matrix';
import { Cube } from './geometry/cube';
import { ShaderProgram } from './shaders/shader-program';
import { Camera } from './camera';
import { Light } from './lighting';
import { debugLog } from './debug-logger';
import { SceneObject } from './scene-object';
import { SceneNode } from './scene-node';
import { Drawable } from './drawable';
import { RayCaster } from './ray-casting';
import { WireframeBox } from './geometry/wireframe-box';
import { wireframeVertexShader, wireframeFragmentShader } from './shaders/wireframe-shader';

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

        // Build hierarchy
        this.sceneRoot.addChild(cube1);
        this.sceneRoot.addChild(cube2);
        this.sceneRoot.addChild(cube3);
        this.sceneRoot.addChild(group);
        group.addChild(groupedCube);

        // Keep backward compatibility
        this.sceneObjects = [cube1, cube2, cube3, groupedCube];
        debugLog.info(`Setup ${this.sceneObjects.length} scene objects in hierarchical tree`);
        debugLog.info(`Scene tree:\n${this.printSceneTree()}`);
    }

    render() {
        this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT);

        // Render objects if enabled
        if (this.showObjects) {
            this.shaderProgram.use();
            this.shaderProgram.setMatrix4('u_view', this.camera.getViewMatrix());
            this.shaderProgram.setMatrix4('u_projection', this.camera.getProjectionMatrix());
            this.shaderProgram.setVector3('u_viewPos', this.camera.position);

            // Set light uniforms
            for (let i = 0; i < this.lights.length; i++) {
                this.shaderProgram.setVector3(`u_lights[${i}].position`, this.lights[i].position);
                this.shaderProgram.setVector3(`u_lights[${i}].color`, this.lights[i].color);
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