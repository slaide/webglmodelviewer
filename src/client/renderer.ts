import { mat4, vec3 } from 'gl-matrix';
import { Cube } from './geometry/cube';
import { ShaderProgram } from './shaders/shader-program';
import { Camera } from './camera';
import { Light } from './lighting';
import { debugLog } from './debug-logger';
import { SceneObject } from './scene-object';
import { RayCaster } from './ray-casting';
import { WireframeBox } from './geometry/wireframe-box';
import { wireframeVertexShader, wireframeFragmentShader } from './shaders/wireframe-shader';

export class WebGLRenderer {
    private gl: WebGL2RenderingContext;
    private shaderProgram!: ShaderProgram;
    private wireframeShaderProgram!: ShaderProgram;
    private camera!: Camera;
    private lights: Light[] = [];
    private sceneObjects: SceneObject[] = [];
    private selectedObject: SceneObject | null = null;
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
        // Create a few cube objects
        const cube1 = new SceneObject('cube1', 'Cube 1', new Cube(this.gl));
        cube1.position = vec3.fromValues(0, 0, 0);
        cube1.material.color = vec3.fromValues(0.8, 0.6, 0.4);

        const cube2 = new SceneObject('cube2', 'Cube 2', new Cube(this.gl));
        cube2.position = vec3.fromValues(3, 0, 0);
        cube2.material.color = vec3.fromValues(0.4, 0.8, 0.6);

        const cube3 = new SceneObject('cube3', 'Cube 3', new Cube(this.gl));
        cube3.position = vec3.fromValues(-3, 0, 0);
        cube3.material.color = vec3.fromValues(0.6, 0.4, 0.8);

        this.sceneObjects = [cube1, cube2, cube3];
        debugLog.info(`Setup ${this.sceneObjects.length} scene objects`);
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

            // Render all scene objects
            for (const obj of this.sceneObjects) {
                obj.updateModelMatrix();
                
                // Set object-specific uniforms
                this.shaderProgram.setMatrix4('u_model', obj.modelMatrix);
                this.shaderProgram.setVector3('u_material.color', obj.material.color);
                this.shaderProgram.setFloat('u_material.ambient', obj.material.ambient);
                this.shaderProgram.setFloat('u_material.diffuse', obj.material.diffuse);
                this.shaderProgram.setFloat('u_material.specular', obj.material.specular);
                this.shaderProgram.setFloat('u_material.shininess', obj.material.shininess);

                obj.render();
            }
        }

        // Render bounding boxes if enabled
        if (this.showBoundingBoxes) {
            this.gl.disable(this.gl.DEPTH_TEST);
            this.wireframeShaderProgram.use();
            this.wireframeShaderProgram.setMatrix4('uViewMatrix', this.camera.getViewMatrix());
            this.wireframeShaderProgram.setMatrix4('uProjectionMatrix', this.camera.getProjectionMatrix());

            for (const obj of this.sceneObjects) {
                if (obj.selected) {
                    // Use local bounding box with object's model matrix
                    this.wireframeBox.initialize(obj.boundingBox);
                    
                    // Apply the object's transformation to the wireframe
                    this.wireframeShaderProgram.setMatrix4('uModelMatrix', obj.modelMatrix);
                    this.wireframeShaderProgram.setVector3('uColor', vec3.fromValues(1, 1, 0)); // Yellow wireframe

                    this.wireframeBox.render();
                }
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

    selectObjectAt(x: number, y: number, canvasWidth?: number, canvasHeight?: number): SceneObject | null {
        const width = canvasWidth || this.canvas.width;
        const height = canvasHeight || this.canvas.height;
        const selectedObject = RayCaster.selectObject(x, y, width, height, this.camera, this.sceneObjects);
        
        // Clear previous selection
        if (this.selectedObject) {
            this.selectedObject.selected = false;
        }
        
        // Set new selection
        this.selectedObject = selectedObject;
        if (this.selectedObject) {
            this.selectedObject.selected = true;
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
}