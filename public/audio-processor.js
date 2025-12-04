class VSDKAudioProcessor extends AudioProcessor {
  speechToTextWorkerPort = null;
  speechToTextWorkerReady = false; 
  processorReady = false;
  
  messageFromSpeechToTextWorker = (e) => {
    const {event, payload} = e.data;
    switch(event) {
            case "speechtotext-ready": 
                console.log("Speech to Text Worker Ready!");
                this.speechToTextWorkerReady = true;
                break;
        }
  }; 
  
  constructor(port, options) {
    super(port, options);

    this.audioBufferQueue = new Int16Array(0);
    this.sampleRate = sampleRate; 
    this.bufferSize = Math.floor(this.sampleRate * 0.1); // 100ms

    this.port.onmessage = (e) => {
        const {event, payload} = e.data;
        switch(event) {
            case "init": 
                console.log("Initializing VSDK Audio Processor...");
                this.speechToTextWorkerPort = e.ports[0];
                this.speechToTextWorkerPort.onmessage = this.messageFromSpeechToTextWorker;
                this.ready = true;
                console.log("VSDK Audio Processor Ready!");
                break;
        }
    }
  }

  process(inputs, outputs) {
    const input = inputs[0];
    const output = outputs[0];

    for (let channel = 0; channel < input.length; channel++) {
      output[channel].set(input[channel]);
    }

    if (this.processorReady && this.speechToTextWorkerReady && input[0]) {
      // convert Float32Array -> Int16Array
      const int16Data = this.convertFloat32ToInt16(input[0]);

      this.audioBufferQueue = this.mergeBuffers(this.audioBufferQueue, int16Data);

      const bufferDuration = (this.audioBufferQueue.length / this.sampleRate) * 1000;
      if (bufferDuration >= 100) {
        const totalSamples = Math.min(this.bufferSize, this.audioBufferQueue.length);
        
        const dataToSend = this.audioBufferQueue.subarray(0, totalSamples);
        const copyBuffer = new Int16Array(dataToSend.length);
        copyBuffer.set(dataToSend);
        
        const finalBuffer = new Uint8Array(copyBuffer.buffer);
        
        this.speechToTextWorkerPort.postMessage({ 
          event: 'transcribe-audio',
          payload: {
            data: finalBuffer,
            timestamp: Date.now()
          }
        }, [finalBuffer.buffer]);
        
        const remainingSamples = this.audioBufferQueue.length - totalSamples;
        if (remainingSamples > 0) {
          const newQueue = new Int16Array(remainingSamples);
          newQueue.set(this.audioBufferQueue.subarray(totalSamples));
          this.audioBufferQueue = newQueue;
        } else {
          this.audioBufferQueue = new Int16Array(0);
        }
      }
    }
    return true;
  }

  convertFloat32ToInt16(float32Array) {
    const int16Array = new Int16Array(float32Array.length);
    for (let i = 0; i < float32Array.length; i++) {
      int16Array[i] = Math.max(-1, Math.min(1, float32Array[i])) * 32767;
    }
    return int16Array;
  }

  mergeBuffers(oldBuffer, newBuffer) {
    const merged = new Int16Array(oldBuffer.length + newBuffer.length);
    merged.set(oldBuffer, 0);
    merged.set(newBuffer, oldBuffer.length);
    return merged;
  }
}

registerProcessor("vsdk-audio-processor", VSDKAudioProcessor);