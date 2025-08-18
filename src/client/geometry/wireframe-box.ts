import { vec3 } from 'gl-matrix';
import { BoundingBox } from '../scene-object';

export class WireframeBox {
    private vao: WebGLVertexArrayObject | null = null;
    private vbo: WebGLBuffer | null = null;
    private vertexCount = 0;

    constructor(private gl: WebGL2RenderingContext) {}

    initialize(boundingBox: BoundingBox) {
        const vertices = this.createWireframeVertices(boundingBox);
        
        this.vao = this.gl.createVertexArray();
        this.gl.bindVertexArray(this.vao);

        this.vbo = this.gl.createBuffer();
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.vbo);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array(vertices), this.gl.STATIC_DRAW);

        // Position attribute
        this.gl.enableVertexAttribArray(0);
        this.gl.vertexAttribPointer(0, 3, this.gl.FLOAT, false, 3 * 4, 0);

        this.vertexCount = vertices.length / 3;

        this.gl.bindVertexArray(null);
    }

    private createWireframeVertices(boundingBox: BoundingBox): number[] {
        const min = boundingBox.min;
        const max = boundingBox.max;

        // Define the 8 corners of the bounding box
        const corners = [
            [min[0], min[1], min[2]], // 0: min corner
            [max[0], min[1], min[2]], // 1: max x
            [max[0], max[1], min[2]], // 2: max x, max y
            [min[0], max[1], min[2]], // 3: max y
            [min[0], min[1], max[2]], // 4: max z
            [max[0], min[1], max[2]], // 5: max x, max z
            [max[0], max[1], max[2]], // 6: max corner
            [min[0], max[1], max[2]]  // 7: max y, max z
        ];

        // Define the 12 edges of the box (each edge has 2 vertices)
        const edges = [
            // Bottom face
            [0, 1], [1, 2], [2, 3], [3, 0],
            // Top face
            [4, 5], [5, 6], [6, 7], [7, 4],
            // Vertical edges
            [0, 4], [1, 5], [2, 6], [3, 7]
        ];

        const vertices: number[] = [];
        for (const edge of edges) {
            // Add both vertices of the edge
            vertices.push(...corners[edge[0]]);
            vertices.push(...corners[edge[1]]);
        }

        return vertices;
    }

    updateBoundingBox(boundingBox: BoundingBox) {
        if (!this.vao || !this.vbo) return;

        const vertices = this.createWireframeVertices(boundingBox);
        
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.vbo);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array(vertices), this.gl.STATIC_DRAW);
        
        this.vertexCount = vertices.length / 3;
    }

    render() {
        if (!this.vao) return;
        
        this.gl.bindVertexArray(this.vao);
        this.gl.drawArrays(this.gl.LINES, 0, this.vertexCount);
        this.gl.bindVertexArray(null);
    }

    cleanup() {
        if (this.vao) {
            this.gl.deleteVertexArray(this.vao);
            this.vao = null;
        }
        if (this.vbo) {
            this.gl.deleteBuffer(this.vbo);
            this.vbo = null;
        }
    }
}