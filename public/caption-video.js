class CaptionProcessor extends VideoProcessor {
    /** @type {OffscreenCanvasRenderingContext2D} */
    context = null;
    /** @type {ImageBitmap} */
    captionImage = null;

    /**
     * @param {MessagePort} port - The message port for communication.
     * @param {Object} [options={}] - Optional processor options.
     */
    constructor(port, options = {}) {
        super(port, options);
        /**
         * @param {MessageEvent} event - The message event containing command and data.
         */
        port.onmessage = (event) => {
            try {
                const { cmd, image } = event.data;
                if (cmd === 'caption') {
                    this.captionImage = image;
                }
            } catch (error) {
                console.error('Error processing message:', error);
            }
        };
    }

    onInit() {
        const canvas = this.getOutput();
        if (canvas) {
            this.context = canvas.getContext('2d');
            if (!this.context) {
                console.error('2D context could not be initialized.');
                return;
            }
        }
    }

    onUninit() {
        this.context = null;
        this.captionImage = null;
    }
    /**
     * @param {VideoFrame} input - The input video frame to process.
     * @param {OffscreenCanvas} output - The canvas to draw the processed frame.
     * @returns {Promise<boolean>} Resolves to true if processing was successful.
     */
    async processFrame(input, output) {
        if (!this.context) return;
        this.context.drawImage(input, 0, 0, output.width, output.height);
        if (this.captionImage) {
            this.context.imageSmoothingEnabled = true;
            this.context.drawImage(this.captionImage, 0, 0, output.width, output.height);
        }
        return true;
    }
}

registerProcessor('caption', CaptionProcessor);