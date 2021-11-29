import path from 'path';
import { promises as fs } from 'fs';

import makeDir from 'make-dir';
import { optimize, createContentItem } from 'svgo';

const HEROCIONS_PATH = path.join(process.cwd(), 'node_modules/heroicons');
const HEROCIONS_SOLID_PATH = path.join(HEROCIONS_PATH, 'solid');
const HEROCIONS_OUTLINE_PATH = path.join(HEROCIONS_PATH, 'outline');

const OUTDIR = path.join(process.cwd(), 'app/icons');
const OUTDIR_SOLID = path.join(OUTDIR, 'solid');
const OUTDIR_OUTLINE = path.join(OUTDIR, 'outline');

async function wrapSymbol(inputPath, outputDir) {
  const ext = path.extname(inputPath);
  const base = path.basename(inputPath, ext);
  const content = await fs.readFile(inputPath, 'utf-8');
  const outputPath = path.join(outputDir, `${base}.svg`);

  const result = optimize(content, {
    path: inputPath,
    plugins: [
      {
        name: 'preset-default',
        params: {
          overrides: {
            removeViewBox: {
              active: false,
            },
            removeDimensions: {
              active: true,
            },
          },
        },
      },
      {
        name: 'wrapInSymbol',
        type: 'perItem',
        fn: item => {
          if (item.type === 'element') {
            if (item.name === 'svg') {
              const { xmlns, ...attributes } = item.attributes;

              for (const attribute in attributes) {
                if (Object.hasOwnProperty.call(attributes, attribute)) {
                  delete item.attributes[attribute];
                }
              }

              const children = item.children;

              item.children = [
                createContentItem({
                  type: 'element',
                  name: 'symbol',
                  attributes: { ...attributes, id: base },
                  children,
                }),
              ];
            }
          }
        },
      },
    ],
  });

  const optimizedSvgString = result.data;

  return fs.writeFile(outputPath, optimizedSvgString);
}

async function compile() {
  // 1. verify all output directories exist
  await Promise.all([makeDir(OUTDIR_OUTLINE), makeDir(OUTDIR_SOLID)]);

  // 2. get all svg icons from heroicons
  const [solid, outline] = await Promise.all([
    fs.readdir(HEROCIONS_SOLID_PATH),
    fs.readdir(HEROCIONS_OUTLINE_PATH),
  ]);

  // 3. generate icons
  await Promise.all([
    ...solid.map(icon =>
      wrapSymbol(path.join(HEROCIONS_SOLID_PATH, icon), OUTDIR_SOLID)
    ),
    ...outline.map(icon =>
      wrapSymbol(path.join(HEROCIONS_OUTLINE_PATH, icon), OUTDIR_OUTLINE)
    ),
  ]);
}

compile();
