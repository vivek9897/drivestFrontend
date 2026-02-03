const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

async function generateIcon() {
  try {
    const svgPath = path.join(__dirname, 'assets', 'icon.svg');
    const outputPath = path.join(__dirname, 'assets', 'logo.png');
    
    // Read SVG file
    const svgBuffer = fs.readFileSync(svgPath);
    
    // Convert SVG to PNG at 1024x1024
    await sharp(svgBuffer, { density: 150 })
      .png()
      .resize(1024, 1024, {
        fit: 'contain',
        background: { r: 255, g: 255, b: 255, alpha: 1 }
      })
      .toFile(outputPath);
    
    console.log('✅ App icon generated successfully: assets/logo.png (1024x1024)');
    
  } catch (error) {
    console.error('❌ Error generating icon:', error.message);
    process.exit(1);
  }
}

generateIcon();
