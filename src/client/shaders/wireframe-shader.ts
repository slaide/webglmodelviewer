export const wireframeVertexShader = `#version 300 es
in vec3 aPosition;

uniform mat4 uModelMatrix;
uniform mat4 uViewMatrix;
uniform mat4 uProjectionMatrix;

void main() {
    gl_Position = uProjectionMatrix * uViewMatrix * uModelMatrix * vec4(aPosition, 1.0);
}
`;

export const wireframeFragmentShader = `#version 300 es
precision mediump float;

uniform vec3 uColor;
out vec4 fragColor;

void main() {
    fragColor = vec4(uColor, 1.0);
}
`;