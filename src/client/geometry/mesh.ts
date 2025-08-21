export class Mesh {
  private vao!: WebGLVertexArrayObject;
  private vboPos!: WebGLBuffer;
  private vboNor!: WebGLBuffer;
  private vboUV?: WebGLBuffer;
  private vertexCount!: number;

  constructor(private gl: WebGL2RenderingContext, positions: Float32Array, normals?: Float32Array, private meta: any = {}, uvs?: Float32Array) {
    if (!normals || normals.length === 0) {
      normals = this.computeFlatNormals(positions);
    }
    this.createGeometry(positions, normals, uvs);
  }

  private createGeometry(positions: Float32Array, normals: Float32Array, uvs?: Float32Array) {
    this.vertexCount = positions.length / 3;
    this.vao = this.gl.createVertexArray()!;
    this.gl.bindVertexArray(this.vao);

    this.vboPos = this.gl.createBuffer()!;
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.vboPos);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, positions, this.gl.STATIC_DRAW);
    this.gl.enableVertexAttribArray(0);
    this.gl.vertexAttribPointer(0, 3, this.gl.FLOAT, false, 0, 0);

    this.vboNor = this.gl.createBuffer()!;
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.vboNor);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, normals, this.gl.STATIC_DRAW);
    this.gl.enableVertexAttribArray(1);
    this.gl.vertexAttribPointer(1, 3, this.gl.FLOAT, false, 0, 0);

    if (uvs && uvs.length === this.vertexCount * 2) {
      this.vboUV = this.gl.createBuffer()!;
      this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.vboUV);
      this.gl.bufferData(this.gl.ARRAY_BUFFER, uvs, this.gl.STATIC_DRAW);
      this.gl.enableVertexAttribArray(2);
      this.gl.vertexAttribPointer(2, 2, this.gl.FLOAT, false, 0, 0);
    }

    this.gl.bindVertexArray(null);
  }

  private computeFlatNormals(positions: Float32Array): Float32Array {
    const normals = new Float32Array(positions.length);
    for (let i = 0; i < positions.length; i += 9) {
      const ax = positions[i], ay = positions[i + 1], az = positions[i + 2];
      const bx = positions[i + 3], by = positions[i + 4], bz = positions[i + 5];
      const cx = positions[i + 6], cy = positions[i + 7], cz = positions[i + 8];
      const ux = bx - ax, uy = by - ay, uz = bz - az;
      const vx = cx - ax, vy = cy - ay, vz = cz - az;
      // cross(u,v)
      let nx = uy * vz - uz * vy;
      let ny = uz * vx - ux * vz;
      let nz = ux * vy - uy * vx;
      const len = Math.hypot(nx, ny, nz) || 1;
      nx /= len; ny /= len; nz /= len;
      normals.set([nx, ny, nz, nx, ny, nz, nx, ny, nz], i);
    }
    return normals;
  }

  render() {
    this.gl.bindVertexArray(this.vao);
    this.gl.drawArrays(this.gl.TRIANGLES, 0, this.vertexCount);
    this.gl.bindVertexArray(null);
  }

  getStats() {
    return {
      vertices: this.vertexCount,
      faces: Math.floor(this.vertexCount / 3),
      hasUVs: !!this.meta?.hasUVs,
      smoothing: !!this.meta?.smoothing,
      groups: Array.isArray(this.meta?.groups) ? this.meta.groups.length : 0,
      objects: Array.isArray(this.meta?.objects) ? this.meta.objects.length : 0
    } as any;
  }
}
