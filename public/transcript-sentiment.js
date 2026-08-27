importScripts("https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@2.0.0/dist/tf.min.js");

self.window = self

var model = null;
const modelName = 'audiotranscript-sentiment';
const emotions = [
            "admiration",
            "amusement",
            "anger",
            "annoyance",
            "approval",
            "caring",
            "confusion",
            "curiosity",
            "desire",
            "disappointment",
            "disapproval",
            "disgust",
            "embarrassment",
            "excitement",
            "fear",
            "gratitude",
            "grief",
            "joy",
            "love",
            "nervousness",
            "optimism",
            "pride",
            "realization",
            "relief",
            "remorse",
            "sadness",
            "surprise",
        ];

function shuffleArray( array ) {
    for( let i = array.length - 1; i > 0; i-- ) {
        const j = Math.floor( Math.random() * ( i + 1 ) );
        [ array[ i ], array[ j ] ] = [ array[ j ], array[ i ] ];
    }
}

self.onmessage = async (e) => {
    const {event, payload} = e.data;
    switch(event) {
    case "run-detection": 
        runDetection(JSON.parse(payload.allWords), JSON.parse(payload.wordReference), payload.transcript);
        break;
    case "train-model":
        trainModel(payload.sampleSize, payload.epochs);
        break;
    }
}

const runDetection = async (allWords, wordReference, transcript) => {
  try {
    if (model) {
       let sentence = transcript;

       console.log(`Running detection on transcript text: ${sentence}`);

        let vector = new Array( allWords.length ).fill( 0 );
        let words = sentence.replace(/[^a-z ]/gi, "").toLowerCase().split( " " ).filter( x => !!x );

        words.forEach( w => {
            if( w in wordReference ) {
                vector[ wordReference[ w ] ] = 1;
            }
        });

        let prediction = await model.predict( tf.stack( [ tf.tensor1d( vector ) ] ) ).data();
        let id = prediction.indexOf( Math.max( ...prediction ) );
        let result = emotions[ id ];
        console.log( `Result: ${result}` );

        self.postMessage({
            event: "sentiment-result",
            payload: { result }
        });
        return;
    }
    else {
        console.log("model not found in browser storage. Retraining Model...");
        trainModel();
    }
  } catch (err) {
    console.error(err);
  }
};

const trainModel = async (sampleSize, epochs) => {
    console.log(`Please wait. Training the model...`);

    //train and save model to browser indexeddb
    let data = await fetch(self.location.origin + "/models/emotions.tsv").then( r => r.text() );

    let lines = data.split( "\n" ).filter( x => !!x ); // Split & remove empty lines

    // Randomize the lines
    shuffleArray( lines );

    // Process 200 lines to generate a "bag of words"
    const numSamples = sampleSize;
    let bagOfWords = {};
    let allWords = [];
    let wordReference = {};
    let sentences = lines.slice( 0, numSamples ).map( line => {
        let sentence = line.split( "\t" )[ 0 ];
        return sentence;
    });

    sentences.forEach( s => {
        let words = s.replace(/[^a-z ]/gi, "").toLowerCase().split( " " ).filter( x => !!x );
        words.forEach( w => {
            if( !bagOfWords[ w ] ) {
                bagOfWords[ w ] = 0;
            }
            bagOfWords[ w ]++;
        });
    });

    allWords = Object.keys( bagOfWords );
    allWords.forEach( ( w, i ) => {
        wordReference[ w ] = i; //i is the index location to be used in the sentence vectors created below
    });

    // Generate array of vectors for each of the sentences. Map iterates through all sentences in the sample data range, returns a vector equal to the size of the vocabulary array "wordReference". 
    // For each sentence, take the word and see if its in wordreference. If so, get the corresponding index of that word and assign 1 to the same index location in the vector
    let vectors = sentences.map( s => { 
        let vector = new Array( allWords.length ).fill( 0 ); //make an array of of all 0's [0,0,0,0,0,0,0...]
        let words = s.replace(/[^a-z ]/gi, "").toLowerCase().split( " " ).filter( x => !!x );
        words.forEach( w => {
            if( w in wordReference ) {
                vector[ wordReference[ w ] ] = 1;
            }
        });
        return vector;
    });

    let outputs = lines.slice( 0, numSamples ).map( line => {
        let categories = line.split( "\t" )[ 1 ].split( "," ).map( x => parseInt( x ) );
        let output = [];
        for( let i = 0; i < emotions.length; i++ ) {
            output.push( categories.includes( i ) ? 1 : 0 );
        }
        return output;
    });

    model = tf.sequential();
    model.add(tf.layers.dense( { units: 100, activation: "relu", inputShape: [ allWords.length ] } ) );
    model.add(tf.layers.dense( { units: 50, activation: "relu" } ) );
    model.add(tf.layers.dense( { units: 25, activation: "relu" } ) );
    model.add(tf.layers.dense( {
        units: emotions.length,
        activation: "softmax"
    }));

    model.compile({
        optimizer: tf.train.adam(),
        loss: "categoricalCrossentropy",
        metrics: [ "accuracy" ]
    });

    const xs = tf.stack( vectors.map( x => tf.tensor1d( x ) ) );
    const ys = tf.stack( outputs.map( x => tf.tensor1d( x ) ) );
    await model.fit( xs, ys, {
        epochs: epochs,
        shuffle: true,
        callbacks: {
            onEpochEnd: ( epoch, logs ) => {
                console.log( "\r" + `Training... Epoch #${epoch} (${logs.acc})` );
            }
        }
    } );

    await model.save(`indexeddb://${modelName}`);

    self.postMessage({
        event: "model-inited",
        payload: {
            allWords: JSON.stringify(allWords),
            wordReference: JSON.stringify(wordReference)
        }
    });

    console.log(`Model trained and saved to IndexedDB`);
};

(async () => {
    try {
        model = await tf.loadLayersModel('indexeddb://' + modelName);
        console.log("using previously saved model:", model);
    } catch (err) {
        trainModel();
    }
})();