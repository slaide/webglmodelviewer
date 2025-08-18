import { mat4, vec3 } from 'gl-matrix';
import { Cube } from './geometry/cube';

export interface Material {
    color: vec3;
    ambient: number;
    diffuse: number;
    specular: number;
    shininess: number;
}

export interface BoundingBox {
    min: vec3;
    max: vec3;
}

export class SceneObject {
    public id: string;
    public name: string;
    public position = vec3.fromValues(0, 0, 0);
    public rotation = vec3.fromValues(0, 0, 0);
    public scale = vec3.fromValues(1, 1, 1);
    public modelMatrix = mat4.create();
    public selected = false;

    public material: Material = {
        color: vec3.fromValues(0.8, 0.6, 0.4),
        ambient: 0.1,
        diffuse: 0.8,
        specular: 0.5,
        shininess: 32.0
    };

    public boundingBox: BoundingBox = {
        min: vec3.fromValues(-1.0, -1.0, -1.0),
        max: vec3.fromValues(1.0, 1.0, 1.0)
    };

    constructor(id: string, name: string, public geometry: Cube) {
        this.id = id;
        this.name = name;
        this.updateModelMatrix();
    }

    updateModelMatrix() {
        mat4.identity(this.modelMatrix);
        mat4.translate(this.modelMatrix, this.modelMatrix, this.position);
        mat4.rotateX(this.modelMatrix, this.modelMatrix, this.rotation[0]);
        mat4.rotateY(this.modelMatrix, this.modelMatrix, this.rotation[1]);
        mat4.rotateZ(this.modelMatrix, this.modelMatrix, this.rotation[2]);
        mat4.scale(this.modelMatrix, this.modelMatrix, this.scale);
    }

    getWorldBoundingBox(): BoundingBox {
        const worldMin = vec3.create();
        const worldMax = vec3.create();
        
        // Transform local bounding box to world space
        const corners = [
            vec3.fromValues(this.boundingBox.min[0], this.boundingBox.min[1], this.boundingBox.min[2]),
            vec3.fromValues(this.boundingBox.max[0], this.boundingBox.min[1], this.boundingBox.min[2]),
            vec3.fromValues(this.boundingBox.min[0], this.boundingBox.max[1], this.boundingBox.min[2]),
            vec3.fromValues(this.boundingBox.max[0], this.boundingBox.max[1], this.boundingBox.min[2]),
            vec3.fromValues(this.boundingBox.min[0], this.boundingBox.min[1], this.boundingBox.max[2]),
            vec3.fromValues(this.boundingBox.max[0], this.boundingBox.min[1], this.boundingBox.max[2]),
            vec3.fromValues(this.boundingBox.min[0], this.boundingBox.max[1], this.boundingBox.max[2]),
            vec3.fromValues(this.boundingBox.max[0], this.boundingBox.max[1], this.boundingBox.max[2])
        ];

        vec3.copy(worldMin, corners[0]);
        vec3.copy(worldMax, corners[0]);

        for (const corner of corners) {
            vec3.transformMat4(corner, corner, this.modelMatrix);
            vec3.min(worldMin, worldMin, corner);
            vec3.max(worldMax, worldMax, corner);
        }

        return { min: worldMin, max: worldMax };
    }

    render() {
        this.geometry.render();
    }
}