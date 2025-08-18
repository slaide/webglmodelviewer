export class Cube {
    private vao!: WebGLVertexArrayObject;
    private wireframeVao!: WebGLVertexArrayObject;
    private vertexBuffer!: WebGLBuffer;
    private normalBuffer!: WebGLBuffer;
    private indexBuffer!: WebGLBuffer;
    private wireframeIndexBuffer!: WebGLBuffer;
    private indexCount!: number;
    private wireframeIndexCount!: number;
    private vertexCount!: number;

    constructor(private gl: WebGL2RenderingContext) {
        this.createGeometry();
    }

    private createGeometry() {
        const vertices = new Float32Array([
            -1, -1,  1,   1, -1,  1,   1,  1,  1,  -1,  1,  1,
            -1, -1, -1,  -1,  1, -1,   1,  1, -1,   1, -1, -1,
            -1,  1, -1,  -1,  1,  1,   1,  1,  1,   1,  1, -1,
            -1, -1, -1,   1, -1, -1,   1, -1,  1,  -1, -1,  1,
             1, -1, -1,   1,  1, -1,   1,  1,  1,   1, -1,  1,
            -1, -1, -1,  -1, -1,  1,  -1,  1,  1,  -1,  1, -1
        ]);

        const normals = new Float32Array([
             0,  0,  1,   0,  0,  1,   0,  0,  1,   0,  0,  1,
             0,  0, -1,   0,  0, -1,   0,  0, -1,   0,  0, -1,
             0,  1,  0,   0,  1,  0,   0,  1,  0,   0,  1,  0,
             0, -1,  0,   0, -1,  0,   0, -1,  0,   0, -1,  0,
             1,  0,  0,   1,  0,  0,   1,  0,  0,   1,  0,  0,
            -1,  0,  0,  -1,  0,  0,  -1,  0,  0,  -1,  0,  0
        ]);

        const indices = new Uint16Array([
            0,  1,  2,    0,  2,  3,
            4,  5,  6,    4,  6,  7,
            8,  9,  10,   8,  10, 11,
            12, 13, 14,   12, 14, 15,
            16, 17, 18,   16, 18, 19,
            20, 21, 22,   20, 22, 23
        ]);

        // Wireframe indices (edges of the cube)
        const wireframeIndices = new Uint16Array([
            // Front face
            0, 1,  1, 2,  2, 3,  3, 0,
            // Back face  
            4, 5,  5, 6,  6, 7,  7, 4,
            // Connect front to back
            0, 4,  1, 7,  2, 6,  3, 5
        ]);

        this.indexCount = indices.length;
        this.vertexCount = vertices.length / 3;
        this.wireframeIndexCount = wireframeIndices.length;

        // Create shared buffers
        this.vertexBuffer = this.gl.createBuffer()!;
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.vertexBuffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, vertices, this.gl.STATIC_DRAW);

        this.normalBuffer = this.gl.createBuffer()!;
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.normalBuffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, normals, this.gl.STATIC_DRAW);

        // Create solid VAO
        this.vao = this.gl.createVertexArray()!;
        this.gl.bindVertexArray(this.vao);
        
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.vertexBuffer);
        this.gl.enableVertexAttribArray(0);
        this.gl.vertexAttribPointer(0, 3, this.gl.FLOAT, false, 0, 0);
        
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.normalBuffer);
        this.gl.enableVertexAttribArray(1);
        this.gl.vertexAttribPointer(1, 3, this.gl.FLOAT, false, 0, 0);

        this.indexBuffer = this.gl.createBuffer()!;
        this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
        this.gl.bufferData(this.gl.ELEMENT_ARRAY_BUFFER, indices, this.gl.STATIC_DRAW);

        // Create wireframe VAO
        this.wireframeVao = this.gl.createVertexArray()!;
        this.gl.bindVertexArray(this.wireframeVao);
        
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.vertexBuffer);
        this.gl.enableVertexAttribArray(0);
        this.gl.vertexAttribPointer(0, 3, this.gl.FLOAT, false, 0, 0);
        
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.normalBuffer);
        this.gl.enableVertexAttribArray(1);
        this.gl.vertexAttribPointer(1, 3, this.gl.FLOAT, false, 0, 0);

        this.wireframeIndexBuffer = this.gl.createBuffer()!;
        this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, this.wireframeIndexBuffer);
        this.gl.bufferData(this.gl.ELEMENT_ARRAY_BUFFER, wireframeIndices, this.gl.STATIC_DRAW);

        this.gl.bindVertexArray(null);
    }

    render() {
        this.gl.bindVertexArray(this.vao);
        this.gl.drawElements(this.gl.TRIANGLES, this.indexCount, this.gl.UNSIGNED_SHORT, 0);
        this.gl.bindVertexArray(null);
    }

    renderWireframe() {
        this.gl.bindVertexArray(this.wireframeVao);
        this.gl.drawElements(this.gl.LINES, this.wireframeIndexCount, this.gl.UNSIGNED_SHORT, 0);
        this.gl.bindVertexArray(null);
    }

    getStats() {
        return {
            vertices: this.vertexCount,
            faces: Math.floor(this.indexCount / 3)
        };
    }
}
