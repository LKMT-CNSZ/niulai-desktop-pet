export class Bull2DController {
  constructor({ root, canvas, assetUrl, report, setState }) {
    this.root = root;
    this.canvas = canvas;
    this.assetUrl = assetUrl;
    this.report = report;
    this.setState = setState;
  }

  async loadSprite() {
    const startedAt = performance.now();
    try {
      const image = new Image();
      image.src = this.assetUrl('2d/bull-window-v2.png');
      if (image.decode) await image.decode();
      else {
        await new Promise((resolve, reject) => {
          image.onload = resolve;
          image.onerror = reject;
        });
      }
      this.report?.('info', `二维牛图片解码完成 ${Math.round(performance.now() - startedAt)}ms`);
      const width = image.naturalWidth;
      const height = image.naturalHeight;
      this.canvas.width = width;
      this.canvas.height = height;
      const context = this.canvas.getContext('2d', { willReadFrequently: true });
      context.clearRect(0, 0, width, height);
      context.drawImage(image, 0, 0);
      const pixels = context.getImageData(0, 0, width, height);
      const data = pixels.data;
      const count = width * height;
      const visited = new Uint8Array(count);
      const queue = new Int32Array(count);
      let head = 0;
      let tail = 0;
      const isBackground = (pixelIndex) => {
        const offset = pixelIndex * 4;
        const red = data[offset];
        const green = data[offset + 1];
        const blue = data[offset + 2];
        return Math.max(red, green, blue) - Math.min(red, green, blue) <= 15 &&
          (red + green + blue) / 3 >= 222;
      };
      const enqueue = (pixelIndex) => {
        if (visited[pixelIndex] || !isBackground(pixelIndex)) return;
        visited[pixelIndex] = 1;
        queue[tail++] = pixelIndex;
      };
      for (let x = 0; x < width; x += 1) {
        enqueue(x);
        enqueue((height - 1) * width + x);
      }
      for (let y = 0; y < height; y += 1) {
        enqueue(y * width);
        enqueue(y * width + width - 1);
      }
      while (head < tail) {
        const index = queue[head++];
        const x = index % width;
        if (x > 0) enqueue(index - 1);
        if (x < width - 1) enqueue(index + 1);
        if (index >= width) enqueue(index - width);
        if (index < count - width) enqueue(index + width);
      }
      for (let index = 0; index < count; index += 1) {
        if (visited[index]) data[index * 4 + 3] = 0;
      }
      context.putImageData(pixels, 0, 0);
      this.root?.classList.add('ready');
      this.report?.('info', `二维牛素材已就绪 ${Math.round(performance.now() - startedAt)}ms`);
      return true;
    } catch (error) {
      this.report?.('error', `二维牛素材加载失败: ${error?.stack || error}`);
      return false;
    }
  }

  setVisible(visible) {
    if (this.root) this.root.setAttribute('aria-hidden', String(!visible));
  }

  setMarketState(state) {
    this.setState?.(state);
  }
}

export class Bull3DController {
  constructor({ root, setVisible, setState }) {
    this.root = root;
    this.setVisible = setVisible;
    this.setState = setState;
  }

  setVisibleState(visible) {
    this.setVisible?.(visible);
  }

  setMarketState(state) {
    this.setState?.(state);
  }
}
