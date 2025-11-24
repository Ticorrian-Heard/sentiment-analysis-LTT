class AudioSentimentProcessor extends AudioProcessor {

    model = null;

    constructor(port, options) {
        super(port, options);
    }
    async onInit() {}

    onUninit() {}

    async processFrame(input, output) {
        return true;
    }
}

registerProcessor("audio-sentiment-processor", AudioSentimentProcessor);