/**
 * GIF Player Usage Examples
 * 
 * This file demonstrates how to use the GIF Player module
 * in various scenarios.
 */

import { GifPlayer, isGifAnimated, getGifDuration, getGifMetadata, createGifPlayerOnce } from './gifPlayer';

// ============================================================================
// Example 1: Standalone Player - Play Once and Stop
// ============================================================================

export async function example1_StandalonePlayOnce() {
  // Create a canvas element
  const canvas = document.createElement('canvas');
  document.body.appendChild(canvas);

  // Create player instance that plays once and stops (no looping)
  // Perfect for viewing GIFs outside of slideshow context
  const player = createGifPlayerOnce(canvas, {
    autoPlay: true,
    onFrameChange: (frameIndex) => {
      console.log(`Frame changed to: ${frameIndex}`);
    },
    onComplete: () => {
      console.log('GIF finished playing once and stopped');
    },
    onError: (error) => {
      console.error('Error:', error);
    }
  });

  // Load GIF from file
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'image/gif';
  fileInput.onchange = async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (file) {
      await player.loadFromFile(file);
      // GIF will play once automatically, then stop
    }
  };
}

// ============================================================================
// Example 1b: Basic Usage - Looping Player
// ============================================================================

export async function example1b_LoopingPlayer() {
  // Create a canvas element
  const canvas = document.createElement('canvas');
  document.body.appendChild(canvas);

  // Create player instance with looping enabled
  const player = new GifPlayer({
    canvas,
    autoPlay: true,
    loop: true, // Will loop continuously
    onFrameChange: (frameIndex) => {
      console.log(`Frame changed to: ${frameIndex}`);
    },
    onComplete: () => {
      console.log('Animation completed (but will loop again)');
    },
    onError: (error) => {
      console.error('Error:', error);
    }
  });

  // Load GIF from file
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'image/gif';
  fileInput.onchange = async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (file) {
      await player.loadFromFile(file);
    }
  };
}

// ============================================================================
// Example 2: Integration with Video Player
// ============================================================================

export class VideoPlayerWithGifSupport {
  private gifPlayer: GifPlayer | null = null;
  private videoElement: HTMLVideoElement | null = null;
  private canvas: HTMLCanvasElement;

  constructor(container: HTMLElement) {
    this.canvas = document.createElement('canvas');
    container.appendChild(this.canvas);
  }

  async loadMedia(file: File): Promise<void> {
    // Check if it's a GIF
    if (file.type === 'image/gif' || file.name.endsWith('.gif')) {
      // Use GIF player - plays once and stops (no looping)
      this.gifPlayer = createGifPlayerOnce(this.canvas, {
        autoPlay: true,
        onComplete: () => {
          this.onMediaEnd();
        }
      });
      await this.gifPlayer.loadFromFile(file);
    } else {
      // Use video element
      this.videoElement = document.createElement('video');
      this.videoElement.src = URL.createObjectURL(file);
      this.videoElement.onended = () => this.onMediaEnd();
      this.videoElement.play();
    }
  }

  play(): void {
    if (this.gifPlayer) {
      this.gifPlayer.play();
    } else if (this.videoElement) {
      this.videoElement.play();
    }
  }

  pause(): void {
    if (this.gifPlayer) {
      this.gifPlayer.pause();
    } else if (this.videoElement) {
      this.videoElement.pause();
    }
  }

  stop(): void {
    if (this.gifPlayer) {
      this.gifPlayer.stop();
    } else if (this.videoElement) {
      this.videoElement.pause();
      this.videoElement.currentTime = 0;
    }
  }

  private onMediaEnd(): void {
    console.log('Media playback completed');
    // Handle media end event
  }
}

// ============================================================================
// Example 3: Quick Detection and Duration Check
// ============================================================================

export async function example3_QuickChecks() {
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'image/gif';
  
  fileInput.onchange = async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;

    // Quick check: Is it animated?
    const animated = await isGifAnimated(file);
    console.log(`Is animated: ${animated}`);

    // Quick check: What's the duration?
    const duration = await getGifDuration(file);
    console.log(`Duration: ${duration}ms`);

    // Get full metadata
    const metadata = await getGifMetadata(file);
    console.log('Full metadata:', {
      width: metadata.width,
      height: metadata.height,
      frameCount: metadata.frameCount,
      totalDuration: metadata.totalDuration,
      loopCount: metadata.loopCount,
      isAnimated: metadata.isAnimated
    });
  };
}

// ============================================================================
// Example 4: Slideshow Integration Pattern
// ============================================================================

export class SlideshowGifHandler {
  private player: GifPlayer | null = null;
  private canvas: HTMLCanvasElement;

  constructor(container: HTMLElement) {
    this.canvas = document.createElement('canvas');
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    container.appendChild(this.canvas);
  }

  async loadGif(file: File, onComplete: () => void): Promise<number> {
    // Clean up previous player
    if (this.player) {
      this.player.dispose();
    }

    // Create new player - plays once for slideshow (no looping)
    // Use createGifPlayerOnce for clarity
    this.player = createGifPlayerOnce(this.canvas, {
      autoPlay: true,
      onComplete: () => {
        onComplete();
      }
    });

    // Load and get metadata
    const metadata = await this.player.loadFromFile(file);
    
    // Return duration for slideshow timing
    return metadata.totalDuration;
  }

  stop(): void {
    if (this.player) {
      this.player.stop();
    }
  }

  dispose(): void {
    if (this.player) {
      this.player.dispose();
      this.player = null;
    }
  }
}

// ============================================================================
// Example 5: Frame-by-Frame Control
// ============================================================================

export async function example5_FrameControl() {
  const canvas = document.createElement('canvas');
  document.body.appendChild(canvas);

  const player = new GifPlayer({ canvas });

  // Load GIF
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'image/gif';
  fileInput.onchange = async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (file) {
      await player.loadFromFile(file);
      
      // Seek to specific frame
      player.seekToFrame(5);
      
      // Or seek to specific time
      player.seekToTime(1000); // 1 second
      
      // Play with custom speed
      player.setSpeed(2.0); // 2x speed
      player.play();
    }
  };
}

