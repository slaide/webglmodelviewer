import { mat4, vec3 } from 'gl-matrix';

export class ShaderProgram {
    private program: WebGLProgram;
    private uniformLocations: Map<string, WebGLUniformLocation> = new Map();

    constructor(private gl: WebGL2RenderingContext) {
        this.program = this.createShaderProgram();
        this.getUniformLocations();
    }

    private createShaderProgram(): WebGLProgram {
        const vertexShaderSource = `#version 300 es
        in vec3 a_position;
        in vec3 a_normal;
        in vec2 a_texcoord;
        
        uniform mat4 u_model;
        uniform mat4 u_view;
        uniform mat4 u_projection;
        
        out vec3 v_position;
        out vec3 v_normal;
        out vec2 v_uv;
        
        void main() {
            vec4 worldPosition = u_model * vec4(a_position, 1.0);
            v_position = worldPosition.xyz;
            v_normal = mat3(u_model) * a_normal;
            v_uv = a_texcoord;
            
            gl_Position = u_projection * u_view * worldPosition;
        }`;

        const fragmentShaderSource = `#version 300 es
        precision highp float;
        
        struct Light {
            vec3 position;
            vec3 color;
        };
        
        struct Material {
            vec3 color;
            float ambient;
            float diffuse;
            float specular;
            float shininess;
        };
        
        uniform Light u_lights[3];
        uniform vec3 u_viewPos;
        uniform Material u_material;
        uniform bool u_selected;
        uniform bool u_useTexture;
        uniform sampler2D u_diffuseMap;
        
        in vec3 v_position;
        in vec3 v_normal;
        in vec2 v_uv;
        
        out vec4 fragColor;
        
        void main() {
            vec3 normal = normalize(v_normal);
            vec3 color = vec3(0.0);
            
            vec3 baseColor = u_material.color;
            if (u_useTexture) {
                vec4 tex = texture(u_diffuseMap, v_uv);
                baseColor *= tex.rgb;
            }
            vec3 ambient = u_material.ambient * baseColor;
            
            for (int i = 0; i < 3; i++) {
                vec3 lightDir = normalize(u_lights[i].position - v_position);
                vec3 viewDir = normalize(u_viewPos - v_position);
                vec3 reflectDir = reflect(-lightDir, normal);
                
                float diff = max(dot(normal, lightDir), 0.0);
                vec3 diffuse = u_material.diffuse * diff * u_lights[i].color * baseColor;
                
                float spec = pow(max(dot(viewDir, reflectDir), 0.0), u_material.shininess);
                vec3 specular = u_material.specular * spec * u_lights[i].color;
                
                float distance = length(u_lights[i].position - v_position);
                float attenuation = 1.0 / (1.0 + 0.09 * distance + 0.032 * distance * distance);
                
                color += (diffuse + specular) * attenuation;
            }
            
            color = ambient + color;
            
            fragColor = vec4(color, 1.0);
        }`;

        const vertexShader = this.compileShader(vertexShaderSource, this.gl.VERTEX_SHADER);
        const fragmentShader = this.compileShader(fragmentShaderSource, this.gl.FRAGMENT_SHADER);

        const program = this.gl.createProgram()!;
        this.gl.attachShader(program, vertexShader);
        this.gl.attachShader(program, fragmentShader);
        this.gl.linkProgram(program);

        if (!this.gl.getProgramParameter(program, this.gl.LINK_STATUS)) {
            throw new Error('Shader program link failed: ' + this.gl.getProgramInfoLog(program));
        }

        this.gl.deleteShader(vertexShader);
        this.gl.deleteShader(fragmentShader);

        return program;
    }

    private compileShader(source: string, type: number): WebGLShader {
        const shader = this.gl.createShader(type)!;
        this.gl.shaderSource(shader, source);
        this.gl.compileShader(shader);

        if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
            const error = this.gl.getShaderInfoLog(shader);
            this.gl.deleteShader(shader);
            throw new Error('Shader compile failed: ' + error);
        }

        return shader;
    }

    private getUniformLocations() {
        const uniforms = [
            'u_model', 'u_view', 'u_projection', 'u_viewPos',
            'u_lights[0].position', 'u_lights[0].color',
            'u_lights[1].position', 'u_lights[1].color',
            'u_lights[2].position', 'u_lights[2].color',
            'u_material.color', 'u_material.ambient', 'u_material.diffuse',
            'u_material.specular', 'u_material.shininess',
            'u_useTexture', 'u_diffuseMap'
        ];

        for (const uniform of uniforms) {
            const location = this.gl.getUniformLocation(this.program, uniform);
            if (location) {
                this.uniformLocations.set(uniform, location);
            }
        }
    }

    use() {
        this.gl.useProgram(this.program);
    }

    setMatrix4(name: string, matrix: mat4) {
        const location = this.uniformLocations.get(name);
        if (location) {
            this.gl.uniformMatrix4fv(location, false, matrix as Float32Array);
        }
    }

    setVector3(name: string, vector: vec3) {
        const location = this.uniformLocations.get(name);
        if (location) {
            this.gl.uniform3fv(location, vector as Float32Array);
        }
    }

    setFloat(name: string, value: number) {
        const location = this.uniformLocations.get(name);
        if (location) {
            this.gl.uniform1f(location, value);
        }
    }

    setBool(name: string, value: boolean) {
        const location = this.uniformLocations.get(name);
        if (location) {
            this.gl.uniform1i(location, value ? 1 : 0);
        }
    }

    createProgram(vertexShaderSource: string, fragmentShaderSource: string) {
        const vertexShader = this.compileShader(vertexShaderSource, this.gl.VERTEX_SHADER);
        const fragmentShader = this.compileShader(fragmentShaderSource, this.gl.FRAGMENT_SHADER);

        this.program = this.gl.createProgram()!;
        this.gl.attachShader(this.program, vertexShader);
        this.gl.attachShader(this.program, fragmentShader);
        this.gl.linkProgram(this.program);

        if (!this.gl.getProgramParameter(this.program, this.gl.LINK_STATUS)) {
            throw new Error('Shader program link failed: ' + this.gl.getProgramInfoLog(this.program));
        }

        this.gl.deleteShader(vertexShader);
        this.gl.deleteShader(fragmentShader);

        // Clear old uniform locations and get new ones
        this.uniformLocations.clear();
        this.getWireframeUniformLocations();
    }

    private getWireframeUniformLocations() {
        const wireframeUniforms = ['uModelMatrix', 'uViewMatrix', 'uProjectionMatrix', 'uColor'];

        for (const uniform of wireframeUniforms) {
            const location = this.gl.getUniformLocation(this.program, uniform);
            if (location) {
                this.uniformLocations.set(uniform, location);
            }
        }
    }
}
