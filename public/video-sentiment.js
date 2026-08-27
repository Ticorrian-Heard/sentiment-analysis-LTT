importScripts("https://cdn.jsdelivr.net/npm/@vladmandic/human/dist/human.js");

class VideoSentimentProcessor extends VideoProcessor {
    context = null;
    human = null;

    constructor(port, options) {
        super(port, options);
    }
    async onInit() {
        console.log("HUMAN ", { Human });
        await this.loadFaceDetectionModels();
    }

    onUninit() {}

    isFaceDetectionModelLoaded() {}

    async loadFaceDetectionModels() {
        const config = {
            warmup: 'none',
            backend: 'webgl',
            modelBasePath: self.location.origin + '/models/',
            async: false,
            filter: { enabled: true },
            face: { 
                enabled: true,
                detector: { enabled: true, rotation: false },
                mesh: { enabled: true },
                iris: { enabled: true },
                description: { enabled: true },
                emotion: { enabled: true },
            },
            object: { enabled: false },
            gesture: { enabled: false },
            hand: { enabled: false },
            body: { enabled: false },
            segmentation: { enabled: false },
        }
        this.human = new Human.Human(config);
    }

    async processFrame(input, output) {

        this.context = output.getContext("2d");

        output.width  = input.codedWidth;
        output.height = input.codedHeight;
    
        // Draw the current video frame onto the canvas
        this.context.drawImage(input, 0, 0, output.width, output.height);

        //run Human detection AI
        const result = await this.human.detect(output);

        console.log(result);

        return true;
    }

}

registerProcessor("video-sentiment-processor", VideoSentimentProcessor);