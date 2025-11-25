import ZoomVideo, { VideoPlayer, VideoQuality } from "@zoom/videosdk";
import { generateSignature } from "./utils";
import "./style.css";

// You should sign your JWT with a backend service in a production use-case
const sdkKey = import.meta.env.VITE_SDK_KEY as string;
const sdkSecret = import.meta.env.VITE_SDK_SECRET as string;

const videoContainer = document.querySelector('video-player-container') as HTMLElement;
const topic = "TestOne";
const role = 1;
const username = `User-${String(new Date().getTime()).slice(6)}`;
const client = ZoomVideo.createClient();
await client.init("en-US", "Global", { patchJsMedia: true });

var myWebWorker: any = null;

const startCall = async () => {
    // generate a token to join the session - in production this will be done by your backend
    const token = generateSignature(topic, role, sdkKey, sdkSecret);
    // call the renderVideo function whenever a user joins or leaves
    client.on("peer-video-state-change", renderVideo);
    await client.join(topic, token, username);
    const mediaStream = client.getMediaStream();
    await mediaStream.startAudio();
    await mediaStream.startVideo();

    const processor = await mediaStream.createProcessor({
        name: "audio-sentiment-processor",
        type: "audio",
        url: window.location.origin + "/audio-sentiment.js",
    });
    // Add a processor
    await mediaStream.addProcessor(processor);
    // render the video of the current user
    // await renderVideo({ action: 'Start', userId: client.getCurrentUserInfo().userId });
};

const renderVideo = async (event: { action: "Start" | "Stop"; userId: number; }) => {
    const mediaStream = client.getMediaStream();
    if (event.action === 'Stop') {
        const element = await mediaStream.detachVideo(event.userId);
        Array.isArray(element) ? element.forEach((el) => el.remove()) : element.remove();
    } else {
        const userVideo = await mediaStream.attachVideo(event.userId, VideoQuality.Video_360P);
        videoContainer.appendChild(userVideo as VideoPlayer);
    }
};

const leaveCall = async () => {
    // const mediaStream = client.getMediaStream();
    // for (const user of client.getAllUser()) {
    //     const element = await mediaStream.detachVideo(user.userId);
    //     Array.isArray(element) ? element.forEach((el) => el.remove()) : element.remove();
    // }
    client.off("peer-video-state-change", renderVideo);
    await client.leave();
}

const toggleVideo = async () => {
    const mediaStream = client.getMediaStream();
    if (mediaStream.isCapturingVideo()) {
        await mediaStream.stopVideo();
        // update the canvas when the video is stopped
        await renderVideo({ action: 'Stop', userId: client.getCurrentUserInfo().userId });
    } else {
        await mediaStream.startVideo();
        // update the canvas when the video is started
        await renderVideo({ action: 'Start', userId: client.getCurrentUserInfo().userId });
    }
};

const launchAI = async () => {
    myWebWorker = new Worker(window.location.origin + "/audio-sentiment.js");
    myWebWorker.onmessage = (e: any) => {
        if (e.data.event === "model-inited") {
            const { allWords, wordReference } = e.data.payload;
            localStorage.setItem("allWords", allWords);
            localStorage.setItem("wordReference", wordReference);
        }
    }
};

// UI Logic
const startBtn = document.querySelector("#start-btn") as HTMLButtonElement;
const stopBtn = document.querySelector("#stop-btn") as HTMLButtonElement;
const toggleVideoBtn = document.querySelector("#toggle-video-btn") as HTMLButtonElement;

const aiBtn = document.querySelector("#ai-btn") as HTMLButtonElement;
const runBtn = document.querySelector("#run-btn") as HTMLButtonElement;

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
    stopBtn.style.display = "block";
    toggleVideoBtn.style.display = "block";
});

stopBtn.addEventListener("click", async () => {
    toggleVideoBtn.style.display = "none";
    await leaveCall();
    stopBtn.style.display = "none";
    startBtn.style.display = "block";
    startBtn.innerHTML = "Join";
    startBtn.disabled = false;
});

toggleVideoBtn.addEventListener("click", async () => {
    await toggleVideo();
});

aiBtn.addEventListener("click", async () => {
    launchAI();
    aiBtn.disabled = true;
});

runBtn.addEventListener("click", () => {

   if (!myWebWorker) {
    alert("click 'Launch AI' to initialize Model first");
    return;
   }

   const allWords = localStorage.getItem("allWords");
   const wordReference = localStorage.getItem("wordReference");

    if (!allWords || !wordReference) {
        console.log("Vocabulary list not found in local storage. Retraining model...");
        myWebWorker.postMessage({
            event: 'train-model'
        });
        return;
    }  

   myWebWorker.postMessage({
        event: 'run-detection',
        payload: {
            allWords: allWords,
            wordReference: wordReference,
            transcript: "Hi! I come in peace."
        }
    });
});