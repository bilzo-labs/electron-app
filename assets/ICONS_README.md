# Icon Placeholder

This directory should contain the following icon files:

## Tray Icons (16x16 PNG)
- **icon-idle.png** - Displayed when app is idle (green/blue)
- **icon-syncing.png** - Displayed during sync operation (yellow/orange)
- **icon-error.png** - Displayed when error occurs (red)

## Application Icon
- **icon.ico** - Main Windows application icon (256x256)

## Quick Generation

### Option 1: Online Tools
1. Visit https://www.favicon-generator.org/
2. Upload your logo or create a simple icon
3. Download as PNG and ICO formats

### Option 2: Using Sharp (Node.js)
```bash
npm install sharp
```

```javascript
const sharp = require('sharp');

// Create a simple colored circle
const createIcon = async (color, filename) => {
  const svg = `
    <svg width="16" height="16">
      <circle cx="8" cy="8" r="6" fill="${color}" />
    </svg>
  `;

  await sharp(Buffer.from(svg))
    .png()
    .toFile(filename);
};

createIcon('#4ade80', 'icon-idle.png');
createIcon('#fbbf24', 'icon-syncing.png');
createIcon('#ef4444', 'icon-error.png');
```

### Option 3: Use Existing Icons
Copy icons from your branding assets or use open-source icon packs:
- https://icons8.com/
- https://www.flaticon.com/
- https://remixicon.com/
