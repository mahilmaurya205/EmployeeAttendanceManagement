const fs = require('fs');
const path = require('path');
const https = require('https');

const baseUrl = 'https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights';
const files = [
  'tiny_face_detector_model-weights_manifest.json',
  'tiny_face_detector_model-shard1',
  'face_landmark_68_model-weights_manifest.json',
  'face_landmark_68_model-shard1',
  'face_recognition_model-weights_manifest.json',
  'face_recognition_model-shard1',
  'face_recognition_model-shard2',
  'face_expression_model-weights_manifest.json',
  'face_expression_model-shard1',
];

const outputDir = path.join(__dirname, '..', 'frontend', 'public', 'models');

fs.mkdirSync(outputDir, { recursive: true });

const download = (url, destination) =>
  new Promise((resolve, reject) => {
    https
      .get(url, (response) => {
        if (response.statusCode !== 200) {
          reject(new Error(`HTTP ${response.statusCode} for ${url}`));
          response.resume();
          return;
        }

        const file = fs.createWriteStream(destination);
        response.pipe(file);

        file.on('finish', () => {
          file.close(resolve);
        });

        file.on('error', (error) => {
          fs.unlink(destination, () => reject(error));
        });
      })
      .on('error', reject);
  });

const run = async () => {
  for (const file of files) {
    const url = `${baseUrl}/${file}`;
    const destination = path.join(outputDir, file);
    console.log(`Downloading ${file}...`);
    await download(url, destination);
  }

  console.log(`Face models downloaded to ${outputDir}`);
};

run().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
