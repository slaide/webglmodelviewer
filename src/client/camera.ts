import { mat4, vec3 } from 'gl-matrix';

export class Camera {
    public position = vec3.fromValues(0, 0, 5);
    public front = vec3.fromValues(0, 0, -1);
    public up = vec3.fromValues(0, 1, 0);
    public right = vec3.fromValues(1, 0, 0);
    public worldUp = vec3.fromValues(0, 1, 0);

    public yaw = -90.0; // Initialize looking down the negative Z axis
    public pitch = 0.0;

    private viewMatrix = mat4.create();
    private projectionMatrix = mat4.create();

    private fov = Math.PI / 4;
    private near = 0.1;
    private far = 100.0;

    public movementSpeed = 5.0;
    public mouseSensitivity = 0.1;

    constructor(private aspectRatio: number) {
        this.updateCameraVectors();
        this.updateMatrices();
    }

    private updateCameraVectors() {
        // Calculate new front vector
        const front = vec3.create();
        front[0] = Math.cos(this.yaw * Math.PI / 180) * Math.cos(this.pitch * Math.PI / 180);
        front[1] = Math.sin(this.pitch * Math.PI / 180);
        front[2] = Math.sin(this.yaw * Math.PI / 180) * Math.cos(this.pitch * Math.PI / 180);
        vec3.normalize(this.front, front);

        // Calculate right and up vector
        vec3.cross(this.right, this.front, this.worldUp);
        vec3.normalize(this.right, this.right);
        
        vec3.cross(this.up, this.right, this.front);
        vec3.normalize(this.up, this.up);
    }

    private updateMatrices() {
        this.updateCameraVectors();
        const target = vec3.create();
        vec3.add(target, this.position, this.front);
        mat4.lookAt(this.viewMatrix, this.position, target, this.up);
        mat4.perspective(this.projectionMatrix, this.fov, this.aspectRatio, this.near, this.far);
    }

    setAspectRatio(aspectRatio: number) {
        this.aspectRatio = aspectRatio;
        this.updateProjectionMatrix();
    }

    private updateProjectionMatrix() {
        mat4.perspective(this.projectionMatrix, this.fov, this.aspectRatio, this.near, this.far);
    }

    processKeyboard(direction: 'FORWARD' | 'BACKWARD' | 'LEFT' | 'RIGHT', deltaTime: number) {
        const velocity = this.movementSpeed * deltaTime;
        const movement = vec3.create();

        switch (direction) {
            case 'FORWARD':
                vec3.scale(movement, this.front, velocity);
                vec3.add(this.position, this.position, movement);
                break;
            case 'BACKWARD':
                vec3.scale(movement, this.front, -velocity);
                vec3.add(this.position, this.position, movement);
                break;
            case 'LEFT':
                vec3.scale(movement, this.right, -velocity);
                vec3.add(this.position, this.position, movement);
                break;
            case 'RIGHT':
                vec3.scale(movement, this.right, velocity);
                vec3.add(this.position, this.position, movement);
                break;
        }
    }

    processMouseMovement(xOffset: number, yOffset: number, constrainPitch = true) {
        xOffset *= this.mouseSensitivity;
        yOffset *= this.mouseSensitivity;

        this.yaw += xOffset;
        this.pitch += yOffset;

        if (constrainPitch) {
            this.pitch = Math.max(-89.0, Math.min(89.0, this.pitch));
        }
    }

    getViewMatrix(): mat4 {
        this.updateMatrices();
        return this.viewMatrix;
    }

    getProjectionMatrix(): mat4 {
        return this.projectionMatrix;
    }

    getFov(): number {
        return this.fov;
    }

    getAspectRatio(): number {
        return this.aspectRatio;
    }
}