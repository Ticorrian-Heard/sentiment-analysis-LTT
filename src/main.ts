import ZoomVideo, { event_peer_video_state_change, LiveTranscriptionLanguage, Processor, VideoPlayer, VideoQuality } from "@zoom/videosdk";
import { generateSignature, getBitmap } from "./utils";
import "./style.css";
import * as tf from '@tensorflow/tfjs';

// You should sign your JWT with a backend service in a production use-case
const sdkKey = import.meta.env.VITE_SDK_KEY as string;
const sdkSecret = import.meta.env.VITE_SDK_SECRET as string;

const myShareEle = document.querySelector('#my-screen-share-content-video')! as HTMLVideoElement;
const myShareCanvas = document.querySelector('#my-screen-share-content-canvas')! as HTMLCanvasElement;
const shareCanvas = document.querySelector('#users-screen-share-content-canvas')! as HTMLCanvasElement;
const videoContainer = document.querySelector('video-player-container') as HTMLElement;
const sessionName = "TestOne";
const role = 1;
const username = `User-${String(new Date().getTime()).slice(6)}`;

let videoprocessor: Processor;
let shareprocessor: Processor;
var sentimentWorker: any = null;
var processingPaused = false;

const client = ZoomVideo.createClient();
await client.init("en-US", "Global", { patchJsMedia: false, });

const startCall = async () => {
    const token = generateSignature(sessionName, role, sdkKey, sdkSecret);
    client.on("peer-video-state-change", renderVideo);
    client.on('active-share-change', (payload) => {
        if (payload.state === 'Active') {
            shareCanvas.style.display = 'block';
            mediaStream.startShareView(shareCanvas, payload.userId)
        } else if (payload.state === 'Inactive') {
            shareCanvas.style.display = 'none';
            mediaStream.stopShareView()
        }
    })
    await client.join(sessionName, token, username);
    const mediaStream = client.getMediaStream();
    if (!mediaStream.isSupportVideoProcessor()) alert("Your browser does not support video processor");
    if (!mediaStream.isSupportShareProcessor()) alert("Your browser does not support share processor");
    await mediaStream.startAudio();
    await mediaStream.startVideo();

    client.getAllUser().forEach((user) => {
        if (user.sharerOn) {
            shareCanvas.style.display = 'block';
            mediaStream.startShareView(shareCanvas, user.userId)
        }
    })
    // render the video of the current user
    await renderVideo({ action: 'Start', userId: client.getCurrentUserInfo().userId });

    videoprocessor = await mediaStream.createProcessor({
        name: "caption",
        type: "video",
        url: window.location.origin + "/caption-video.js",
    });
    await mediaStream.addProcessor(videoprocessor);

    shareprocessor = await mediaStream.createProcessor({
        name: "caption",
        type: "share",
        url: window.location.origin + "/caption-screen.js",
        options: { needFixedCaptureRate: true, }
    });

    client.on("caption-message", async (payload) => {
        if (payload.done && !processingPaused) runSentiment(payload.text);

        if (payload.userId === client.getCurrentUserInfo().userId) {
            const { width, height } = mediaStream.getCapturedVideoResolution();
            const videoImageBitmap = await getBitmap(payload.text, width, height);
            videoprocessor.port.postMessage({ cmd: 'caption', image: videoImageBitmap })

            const shareStreamSettings = mediaStream.getShareStreamSettings();
            if (!shareStreamSettings) return;
            if (!shareStreamSettings.width || !shareStreamSettings.height) return;
            const imageBitmap = await getBitmap(payload.text, shareStreamSettings.width, shareStreamSettings.height); // create a bitmap image from text
            shareprocessor.port.postMessage({ cmd: 'caption', image: imageBitmap });
        }
    });
    const liveTranscriptionTranslation = client.getLiveTranscriptionClient();
    await liveTranscriptionTranslation.startLiveTranscription();
    liveTranscriptionTranslation.setSpeakingLanguage(LiveTranscriptionLanguage.English);

    await launchAI();
};

const renderVideo: typeof event_peer_video_state_change = async (event) => {
    const mediaStream = client.getMediaStream();
    if (event.action === 'Stop') {
        const element = await mediaStream.detachVideo(event.userId);
        if (Array.isArray(element))
            element.forEach((el) => el.remove())
        else if (element) element.remove();
    } else {
        const userVideo = await mediaStream.attachVideo(event.userId, VideoQuality.Video_720P);
        videoContainer.appendChild(userVideo as VideoPlayer);
    }
};

const startShare = async () => {
    const mediaStream = client.getMediaStream();
    client.on('passively-stop-share', handlePassiveStop)
    if (mediaStream.isStartShareScreenWithVideoElement()) {
        await mediaStream.startShareScreen(myShareEle, { captureHeight: 720, captureWidth: 1280, displaySurface: "monitor" })
        myShareEle.style.display = 'block';
    } else {
        console.log("can't use video element")
        await mediaStream.startShareScreen(myShareCanvas, { captureHeight: 720, captureWidth: 1280, displaySurface: "monitor" })
        myShareCanvas.style.display = 'block';
    }
    await mediaStream.addProcessor(shareprocessor);
}

const handlePassiveStop = () => {
    myShareEle.style.display = 'none';
    myShareCanvas.style.display = 'none';
    shareCanvas.style.display = 'none';
    const mediaStream = client.getMediaStream();
    mediaStream.removeProcessor(shareprocessor);
    client.off('passively-stop-share', handlePassiveStop)
}

const leaveCall = async () => {
    const mediaStream = client.getMediaStream();
    await mediaStream.stopShareView().catch(e => console.log(e));
    await mediaStream.removeProcessor(shareprocessor).catch(e => console.log(e));
    await mediaStream.removeProcessor(videoprocessor).catch(e => console.log(e));
    for (const user of client.getAllUser()) {
        const element = await mediaStream.detachVideo(user.userId);
        if (Array.isArray(element))
            element.forEach((el) => el.remove())
        else if (element) element.remove();
    }
    client.off("peer-video-state-change", renderVideo);
    myShareEle.style.display = 'none';
    myShareCanvas.style.display = 'none';
    shareCanvas.style.display = 'none';
    await client.leave();
}

const launchAI = async () => {
    sentimentWorker = new Worker(window.location.origin + "/transcript-sentiment.js");
    sentimentWorker.onmessage = (e: any) => {
        const {event, payload: {allWords, wordReference, result}} = e.data;
        switch(event) {
            case 'model-inited':
                localStorage.setItem("allWords", allWords);
                localStorage.setItem("wordReference", wordReference);
                processingPaused = false;
                aiBtn.innerHTML = 'Reset AI';
                aiBtn.disabled = false;
                break;
            case 'sentiment-result':
                sentimentOutput.innerHTML = `Detected Sentiment: ${result}`;
        }
    }
};
    
const runSentiment = (transcript: any) => {
    if (!sentimentWorker) {
        alert("click 'Launch AI' to initialize Model first");
        return;
    }

    const allWords = localStorage.getItem("allWords");
    const wordReference = localStorage.getItem("wordReference");

    if (!allWords || !wordReference) {
        console.log("Vocabulary list not found in local storage. Retraining model...");
        sentimentWorker.postMessage({
            event: 'train-model',
            payload: { sampleSize: 250, epochs: 50 }
        });
        return;
    }  

    sentimentWorker.postMessage({
            event: 'run-detection',
            payload: { allWords, wordReference, transcript }
    });
};

// UI Logic
const startBtn = document.querySelector("#start-btn") as HTMLButtonElement;
const stopBtn = document.querySelector("#stop-btn") as HTMLButtonElement;
const shareBtn = document.querySelector("#share-btn") as HTMLButtonElement;
const aiform = document.querySelector("#ai-form") as HTMLDivElement;
const aiBtn = document.querySelector("#ai-btn") as HTMLButtonElement;
const sampleSize = document.getElementById('sample-size') as HTMLInputElement; 
const epochs = document.getElementById('epochs') as HTMLInputElement;
const sampleSizeOutput = document.getElementById('sample-size-output') as HTMLElement; 
const epochsOutput = document.getElementById('epochs-output') as HTMLElement;
const sentimentOutput = document.getElementById('sentiment') as HTMLElement;


startBtn.addEventListener("click", async () => {
    if (!sdkKey || !sdkSecret) {
        alert("Please enter SDK Key and SDK Secret in the .env file");
        return;
    }
    startBtn.innerHTML = "Connecting...";
    startBtn.disabled = true;
    await startCall();
    startBtn.innerHTML = "Connected";
    startBtn.style.display = "none";
    aiform.style.display = "flex";

    sampleSize.oninput = () => {
        sampleSizeOutput.innerHTML = `Training Sample Size: ${sampleSize.value}`;
    };
    epochs.oninput = () => {
        epochsOutput.innerHTML = `Epochs: ${epochs.value}`;
    };
});

shareBtn.addEventListener("click", startShare);

stopBtn.addEventListener("click", async () => {
    await leaveCall();
    startBtn.style.display = "block";
    startBtn.innerHTML = "Join";
    startBtn.disabled = false;
    aiform.style.display = "none";
});

aiBtn.addEventListener("click", async () => {
    try {
        await tf.io.removeModel("indexeddb://audiotranscript-sentiment");
        console.log(`Model 'audiotranscript-sentiment' successfully removed from IndexedDB.`);
    } catch (error) {
        console.error({error});
    }

    processingPaused = true;
    aiBtn.innerHTML = 'training model...';
    aiBtn.disabled = true;
    
    sentimentWorker.postMessage({
        event: 'train-model',
        payload: { sampleSize: parseInt(sampleSize.value), epochs: parseInt(epochs.value) }
    });
});
