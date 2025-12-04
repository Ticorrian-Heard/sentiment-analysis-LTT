importScripts("https://cdn.jsdelivr.net/npm/assemblyai@4.19.0/dist/assemblyai.streaming.umd.min.js")

var transcriber = null;
var vsdkAudioProcessorPort = null;

let messageFromVSDKAudioProcessor = (e) => {
  const {event, payload} = e.data;
    switch(event) {
            case "transcribe-audio": 
                transcribeAudio(payload);
                break;
        }
  }; 

self.onmessage = async (e) => {
    const {event, payload} = e.data;

    switch(event) {
      case "init": 
          await init();
          vsdkAudioProcessorPort = e.ports[0];
          vsdkAudioProcessorPort.onmessage = messageFromVSDKAudioProcessor;
          break;
    }
};

const getToken = async () => {
  const settings = {
      mode: "cors",
      cache: "no-cache",
      headers: {
        'Content-Type':'application/json',
        'Access-Control-Allow-Origin':'*',
        'Access-Control-Allow-Methods':'GET,OPTIONS'}
  };
  const response = await (await fetch("https://heroku.ticorrianheard.com/assemblyaitoken", settings)).json();
  return response.token;
};

const init = async () => {
  console.log("Initializing Speech to Text Worker...");
  try {
    const { RealtimeTranscriber } = assemblyai;

    transcriber = await new RealtimeTranscriber({
      token: await getToken(),
      sampleRate: 16_000,
    });

    if (transcriber) {
      await connect();
      vsdkAudioProcessorPort.postMessage({
        event: 'speechtotext-ready'
      });
    }
 } catch(err) {
  console.log(err);
 }
};

const connect = async () => {
  console.log("Connecting to AssemblyAI WSS...");
  transcriber.on("transcript", (message) => {
        let msg = "";
        console.log("message:", message);
        texts[message.audio_start] = message.text;
        
        const keys = Object.keys(texts).map(Number)
          .filter(key => key > message.audio_start - 10000)
          .sort((a, b) => a - b);
          
        for (const key of keys) {
          if (texts[key]) {
            msg += ` ${texts[key]}`;
          }
        }
        console.log(msg);
      });
  try {    
    await transcriber.connect();
  } catch(err) {
    console.log(err);
  }
};

const transcribeAudio = (payload) => {
  const {data, timestamp} = payload;
  console.log(timestamp, data);

  if (transcriber) {
    const buffer = new Uint8Array(data);
    transcriber.sendAudio(buffer);
  } else {
    console.warn('Attempted to send audio, but transcriber is not connected.');
  }
};