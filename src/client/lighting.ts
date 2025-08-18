import { vec3 } from 'gl-matrix';

export class Light {
    constructor(
        public position: vec3,
        public color: vec3
    ) {}
}