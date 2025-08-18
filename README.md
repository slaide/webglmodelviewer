# WebGL2 Phong Shading Application

A WebGL2 application that displays a rotating cube with Phong shading, served through Node.js and bundled from TypeScript.

## Features

- **WebGL2 Rendering**: Modern WebGL2 context for enhanced graphics capabilities
- **Phong Shading**: Realistic lighting with ambient, diffuse, and specular components
- **Multiple Lights**: Three colored lights positioned around the scene
- **TypeScript**: Fully typed codebase for better development experience
- **Webpack Bundling**: Optimized bundling and development server

## Project Structure

```
src/
├── client/
│   ├── main.ts              # Entry point
│   ├── renderer.ts          # Main WebGL renderer
│   ├── camera.ts            # Camera system
│   ├── lighting.ts          # Light definitions
│   ├── geometry/
│   │   └── cube.ts          # Cube geometry
│   ├── shaders/
│   │   └── shader-program.ts # Phong shading shaders
│   └── index.html           # HTML template
└── server.ts                # Express server

```

## Installation & Usage

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Build the application:**
   ```bash
   npm run build
   ```

3. **Start the server:**
   ```bash
   npm run dev:server
   ```

4. **Open in browser:**
   Navigate to `http://localhost:3001`

## Scripts

- `npm run build` - Build production bundle
- `npm run dev` - Start webpack dev server
- `npm start` - Start production server
- `npm run dev:server` - Start development server with ts-node

## Technical Details

### Shading Model
The application implements simplified Phong shading with:
- **Ambient lighting**: Base illumination
- **Diffuse lighting**: Lambertian reflection based on surface normals
- **Specular lighting**: Shiny highlights with configurable shininess
- **Distance attenuation**: Realistic light falloff

### Lights
Three colored lights are positioned around the cube:
- Warm light (orange-ish) at position (2, 2, 2)
- Cool light (blue-ish) at position (-2, 1, 1)  
- Green-tinted light at position (0, -1, 2)

### Camera
Static perspective camera positioned at (0, 0, 5) looking at origin with automatic aspect ratio adjustment on window resize.