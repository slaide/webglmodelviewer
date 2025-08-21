const esbuild = require('esbuild');
const path = require('path');
const fs = require('fs');

const isProduction = process.env.NODE_ENV === 'production';

// Copy HTML file
const copyHtml = () => {
  const srcHtml = path.resolve(__dirname, 'src/client/index.html');
  const destHtml = path.resolve(__dirname, 'dist/public/index.html');
  
  // Ensure directory exists
  const destDir = path.dirname(destHtml);
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }
  
  fs.copyFileSync(srcHtml, destHtml);
  console.log('Copied index.html to dist/public/');
};

const buildOptions = {
  entryPoints: ['src/client/main.ts'],
  bundle: true,
  outfile: 'dist/public/bundle.js',
  platform: 'browser',
  target: 'es2020',
  format: 'iife',
  sourcemap: !isProduction,
  minify: isProduction,
  loader: {
    '.ts': 'ts',
  },
  logLevel: 'info',
};

const build = async () => {
  try {
    // Copy HTML file
    copyHtml();
    
    // Build JavaScript
    await esbuild.build(buildOptions);
    console.log('Build completed successfully!');
  } catch (error) {
    console.error('Build failed:', error);
    process.exit(1);
  }
};

const serve = async () => {
  try {
    // Copy HTML file
    copyHtml();
    
    // Start development server
    const context = await esbuild.context({
      ...buildOptions,
      plugins: [
        {
          name: 'rebuild-notify',
          setup(build) {
            build.onEnd(() => {
              console.log('Rebuild completed!');
            });
          },
        },
      ],
    });

    await context.watch();
    
    const { host, port } = await context.serve({
      servedir: 'dist/public',
      port: 8080,
    });

    console.log(`Development server running at http://${host}:${port}`);
  } catch (error) {
    console.error('Dev server failed:', error);
    process.exit(1);
  }
};

// Export for programmatic use
module.exports = { build, serve, buildOptions };

// CLI usage
if (require.main === module) {
  const command = process.argv[2];
  
  if (command === 'serve') {
    serve();
  } else {
    build();
  }
}