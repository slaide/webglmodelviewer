export class Cube {
    private vao!: WebGLVertexArrayObject;
    private vertexBuffer!: WebGLBuffer;
    private normalBuffer!: WebGLBuffer;
    private indexBuffer!: WebGLBuffer;
    private indexCount!: number;

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

        this.indexCount = indices.length;

        this.vao = this.gl.createVertexArray()!;
        this.gl.bindVertexArray(this.vao);

        this.vertexBuffer = this.gl.createBuffer()!;
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.vertexBuffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, vertices, this.gl.STATIC_DRAW);
        this.gl.enableVertexAttribArray(0);
        this.gl.vertexAttribPointer(0, 3, this.gl.FLOAT, false, 0, 0);

        this.normalBuffer = this.gl.createBuffer()!;
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.normalBuffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, normals, this.gl.STATIC_DRAW);
        this.gl.enableVertexAttribArray(1);
        this.gl.vertexAttribPointer(1, 3, this.gl.FLOAT, false, 0, 0);

        this.indexBuffer = this.gl.createBuffer()!;
        this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
        this.gl.bufferData(this.gl.ELEMENT_ARRAY_BUFFER, indices, this.gl.STATIC_DRAW);

        this.gl.bindVertexArray(null);
    }

    render() {
        this.gl.bindVertexArray(this.vao);
        this.gl.drawElements(this.gl.TRIANGLES, this.indexCount, this.gl.UNSIGNED_SHORT, 0);
        this.gl.bindVertexArray(null);
    }
}