/**
 * Standalone GIF Player - Play Once Example
 * 
 * This demonstrates how to use the GIF player outside of a slideshow
 * to play a GIF once and then stop (no looping).
 */

import { createGifPlayerOnce, GifPlayer } from './gifPlayer';

/**
 * Example: Simple standalone GIF viewer that plays once
 */
export function createStandaloneGifViewer(container: HTMLElement) {
  // Create canvas for rendering
  const canvas = document.createElement('canvas');
  canvas.style.maxWidth = '100%';
  canvas.style.height = 'auto';
  container.appendChild(canvas);

  // Create player configured to play once and stop
  const player = createGifPlayerOnce(canvas, {
    autoPlay: true,
    onComplete: () => {
      console.log('GIF finished playing - stopped at last frame');
      // Optionally show a message or enable replay button
    },
    onError: (error) => {
      console.error('Error playing GIF:', error);
    }
  });

  return {
    /**
     * Load and play a GIF file
     */
    async loadGif(file: File | string): Promise<void> {
      if (typeof file === 'string') {
        await player.loadFromUrl(file);
      } else {
        await player.loadFromFile(file);
      }
      // GIF will automatically play once and stop
    },

    /**
     * Manually play the GIF (if paused or stopped)
     */
    play(): void {
      player.play();
    },

    /**
     * Pause the GIF
     */
    pause(): void {
      player.pause();
    },

    /**
     * Stop and reset to first frame
     */
    stop(): void {
      player.stop();
    },

    /**
     * Clean up resources
     */
    dispose(): void {
      player.dispose();
      canvas.remove();
    }
  };
}

/**
 * Example: File input with standalone GIF viewer
 */
export function setupFileInputGifViewer() {
  const container = document.createElement('div');
  container.style.padding = '20px';
  document.body.appendChild(container);

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'image/gif';
  fileInput.style.marginBottom = '20px';
  container.appendChild(fileInput);

  const canvas = document.createElement('canvas');
  canvas.style.border = '1px solid #ccc';
  canvas.style.maxWidth = '100%';
  container.appendChild(canvas);

  const controls = document.createElement('div');
  controls.style.marginTop = '10px';
  container.appendChild(controls);

  const playBtn = document.createElement('button');
  playBtn.textContent = 'Play';
  controls.appendChild(playBtn);

  const pauseBtn = document.createElement('button');
  pauseBtn.textContent = 'Pause';
  controls.appendChild(pauseBtn);

  const stopBtn = document.createElement('button');
  stopBtn.textContent = 'Stop';
  controls.appendChild(stopBtn);

  // Create player - plays once and stops
  const player = createGifPlayerOnce(canvas, {
    autoPlay: false, // Manual control
    onComplete: () => {
      console.log('GIF finished - now stopped');
      playBtn.textContent = 'Replay';
    }
  });

  fileInput.onchange = async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (file) {
      await player.loadFromFile(file);
      playBtn.textContent = 'Play';
    }
  };

  playBtn.onclick = () => {
    player.play();
    playBtn.textContent = 'Playing...';
  };

  pauseBtn.onclick = () => {
    player.pause();
    playBtn.textContent = 'Play';
  };

  stopBtn.onclick = () => {
    player.stop();
    playBtn.textContent = 'Play';
  };
}

/**
 * Example: Using the player directly (manual configuration)
 */
export function manualConfigurationExample() {
  const canvas = document.createElement('canvas');
  document.body.appendChild(canvas);

  // Manual configuration - explicitly set loop to false
  const player = new GifPlayer({
    canvas,
    autoPlay: true,
    loop: false, // Play once, then stop
    onComplete: () => {
      console.log('GIF played once and stopped');
    }
  });

  return player;
}

