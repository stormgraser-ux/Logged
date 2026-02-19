const esbuild = require('esbuild');
const path = require('path');
const fs = require('fs');

const isWatch = process.argv.includes('--watch');

function copyStaticFiles() {
  const distDir = path.resolve(__dirname, 'dist');
  const publicDir = path.resolve(__dirname, 'public');
  const popupDir = path.resolve(__dirname, 'src/popup');

  if (!fs.existsSync(distDir)) fs.mkdirSync(distDir, { recursive: true });

  // Copy manifest.json
  fs.copyFileSync(
    path.join(publicDir, 'manifest.json'),
    path.join(distDir, 'manifest.json')
  );

  // Copy icons
  const iconsDir = path.join(publicDir, 'icons');
  const distIconsDir = path.join(distDir, 'icons');
  if (!fs.existsSync(distIconsDir)) fs.mkdirSync(distIconsDir, { recursive: true });
  if (fs.existsSync(iconsDir)) {
    for (const file of fs.readdirSync(iconsDir)) {
      fs.copyFileSync(path.join(iconsDir, file), path.join(distIconsDir, file));
    }
  }

  // Copy popup HTML and CSS
  fs.copyFileSync(
    path.join(popupDir, 'popup.html'),
    path.join(distDir, 'popup.html')
  );
  fs.copyFileSync(
    path.join(popupDir, 'popup.css'),
    path.join(distDir, 'popup.css')
  );
}

const buildOptions = {
  entryPoints: [
    'src/background/service-worker.ts',
    'src/popup/popup.ts',
  ],
  bundle: true,
  outdir: 'dist',
  format: 'iife',
  target: 'chrome120',
  sourcemap: isWatch ? 'inline' : false,
  minify: !isWatch,
  plugins: [{
    name: 'copy-static',
    setup(build) {
      build.onEnd(() => {
        copyStaticFiles();
        console.log('Build complete → dist/');
      });
    }
  }]
};

async function run() {
  if (isWatch) {
    const ctx = await esbuild.context(buildOptions);
    await ctx.watch();
    console.log('Watching for changes...');
  } else {
    await esbuild.build(buildOptions);
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
