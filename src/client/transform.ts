import { mat4, vec3, quat } from 'gl-matrix';

export class Transform {
    public position: vec3 = vec3.create();
    public rotation: vec3 = vec3.create(); // Euler angles in radians
    public scale: vec3 = vec3.fromValues(1, 1, 1);
    
    private _localMatrix: mat4 = mat4.create();
    private _worldMatrix: mat4 = mat4.create();
    private _isDirty: boolean = true;

    constructor(position?: vec3, rotation?: vec3, scale?: vec3) {
        if (position) vec3.copy(this.position, position);
        if (rotation) vec3.copy(this.rotation, rotation);
        if (scale) vec3.copy(this.scale, scale);
    }

    public setPosition(x: number, y: number, z: number): void {
        vec3.set(this.position, x, y, z);
        this.markDirty();
    }

    public setRotation(x: number, y: number, z: number): void {
        vec3.set(this.rotation, x, y, z);
        this.markDirty();
    }

    public setScale(x: number, y: number, z: number): void {
        vec3.set(this.scale, x, y, z);
        this.markDirty();
    }

    public translate(x: number, y: number, z: number): void {
        vec3.add(this.position, this.position, vec3.fromValues(x, y, z));
        this.markDirty();
    }

    public rotate(x: number, y: number, z: number): void {
        vec3.add(this.rotation, this.rotation, vec3.fromValues(x, y, z));
        this.markDirty();
    }

    public getLocalMatrix(): mat4 {
        if (this._isDirty) {
            this.updateLocalMatrix();
        }
        return this._localMatrix;
    }

    public getWorldMatrix(parentWorldMatrix?: mat4): mat4 {
        const localMatrix = this.getLocalMatrix();
        
        if (parentWorldMatrix) {
            mat4.multiply(this._worldMatrix, parentWorldMatrix, localMatrix);
        } else {
            mat4.copy(this._worldMatrix, localMatrix);
        }
        
        return this._worldMatrix;
    }

    private updateLocalMatrix(): void {
        mat4.identity(this._localMatrix);
        
        // Apply transformations: T * R * S
        mat4.translate(this._localMatrix, this._localMatrix, this.position);
        
        // Apply rotations in XYZ order
        mat4.rotateX(this._localMatrix, this._localMatrix, this.rotation[0]);
        mat4.rotateY(this._localMatrix, this._localMatrix, this.rotation[1]);
        mat4.rotateZ(this._localMatrix, this._localMatrix, this.rotation[2]);
        
        mat4.scale(this._localMatrix, this._localMatrix, this.scale);
        
        this._isDirty = false;
    }

    public markDirty(): void {
        this._isDirty = true;
    }

    public copy(): Transform {
        const transform = new Transform();
        vec3.copy(transform.position, this.position);
        vec3.copy(transform.rotation, this.rotation);
        vec3.copy(transform.scale, this.scale);
        return transform;
    }
}