// /home/eddieoz/Projects/git/atproto-scam-detector/src/main.ts

import dotenv from "dotenv";
import chalk from "chalk";
import { program } from "commander";
import { CronJob } from "cron";
import { AppBskyFeedPost } from "@atproto/api";

import { initializeDatabase } from "./modules/database";
import { initializeBotSession, getBotInstance } from "./modules/botSession";
import { processBufferedMessages } from "./modules/spamDetection";
import { updateScamTerms, processScamMessage } from "./modules/scamDetection";
import { loadIgnoreArray } from "./modules/ignoreWatcher";

import { Bot } from "@skyware/bot";
import { isHandleInMemoryIgnored } from "./modules/memDatabase";
import WebSocket from 'ws';

dotenv.config();

// Time window (seconds) for spam detection aggregator
const TIME_WINDOW_SEC = parseInt(process.env.TIME_WINDOW || "60", 10);
const TIME_WINDOW_MS = TIME_WINDOW_SEC * 1000;

// For buffering spam detection
let messageBuffer: SubscribeReposMessage[] = [];
let spamTimer: NodeJS.Timeout | null = null;

/**
 * Safely process buffered spam messages (clearing interval when done).
 */
/**
 * Buffers incoming messages for spam detection and processes them in batches.
 *
 * This function checks if the sender's handle is in the in-memory ignore list.
 * If the handle is ignored, the message is skipped. Otherwise, the message is
 * added to the message buffer. If a spam detection timer is not already running,
 * one is started to process the buffered messages after a specified time window.
 *
 * @param message - The incoming message to be buffered for spam detection.
 * @param botInstance - The bot instance used for processing and taking actions.
 */
async function bufferAndProcessSpam(
  message: SubscribeReposMessage[],
  botInstance: Bot
) {
  // Check if the sender's handle is in the in-memory ignore list
  if (isHandleInMemoryIgnored(message.did)) {
    console.log(
      chalk.gray.bold(
        `Ignored message from ${message.did} (in-memory ignore list).`
      )
    );
    return;
  }

  // Add the message to the buffer for spam detection
  messageBuffer.push(message);

  // If a spam detection timer is not already running, start one
  if (!spamTimer) {
    spamTimer = setInterval(async () => {
      // Create a local copy of the message buffer and clear the original buffer
      const localBuffer = [...messageBuffer];
      messageBuffer.length = 0;

      // Process the buffered messages for spam detection
      await processBufferedMessages(localBuffer, botInstance);
    }, TIME_WINDOW_MS);
  }
}

/**
 * Configures and runs the real-time scam detection CLI program.
 *
 * This script initializes the system, sets up a cron job for periodic scam term updates,
 * and subscribes to repository events on a specified host. It processes incoming messages
 * to detect both spam and scam content, taking appropriate actions based on the detected
 * patterns.
 *
 * The program expects a single required argument:
 * - `<host>`: The PDS/BGS host to subscribe to for repository events.
 *
 * Key functionalities include:
 * - Initializing the database and bot session.
 * - Loading the ignore array for filtering messages.
 * - Periodically updating scam terms using a cron job.
 * - Subscribing to repository events and handling incoming messages.
 * - Buffering messages for spam detection and processing them in batches.
 * - Detecting scam messages based on predefined terms and patterns.
 *
 * The script also handles subscription errors and close events, ensuring proper cleanup
 * and error logging.
 */
program
  .name("real-time-scam-detector") 
  .description("Detects scam messages in real time") 
  .argument("<host>", "PDS/BGS host") // Define a required argument for the PDS/BGS host
  .action(async (host) => {
    // Action to execute when the program is run
    console.log(chalk.green("Initializing system...")); 
    await initializeDatabase(); 
    const bot = await initializeBotSession(); 
    await loadIgnoreArray(); 

    console.log(chalk.green("Updating scam terms initially...")); 
    await updateScamTerms(); 
    // Setup a cron job to refresh scam terms periodically
    const cronJob = new CronJob("0 */1 * * *", async () => {
      console.log("Cron job: Updating scam terms..."); 
      await updateScamTerms(); 
    });
    cronJob.start(); 
    console.log(chalk.green(`Subscribing to repo events on wss://${host} ...`)); 
    
    // Define the WebSocket URL
    const firehoseUrl = 'wss://jetstream2.us-east.bsky.network/subscribe?wantedCollections=app.bsky.feed.post'; // Replace with the actual firehose URL
    // Create a new WebSocket instance
    const subscription = new WebSocket(firehoseUrl);

    // Event listener for when the connection is opened
    subscription.on('open', () => {
        console.log('Connected to the firehose');
    });
       
    // Event listener for when the connection is closed
    subscription.on('close', () => {
        console.log('Disconnected from the firehose');
    });
    
    // Event listener for errors
    subscription.on('error', (error: Error) => {
        console.error(`WebSocket error: ${error.message}`);
    });

    // Handle incoming messages from the subscription
    subscription.on('message', (message: WebSocket.Data) => {
      try {
        // Convert the Buffer to a string and parse it as JSON
        const messageString = message.toString();
        const messageJson = JSON.parse(messageString);

        // Log the entire message for debugging
        // console.log('Received message:', messageJson);

        // Check if the message contains a commit
        if (messageJson.commit) {
          const commit = messageJson.commit;

          // Check if the operation is a create action and the payload is a post
          if (
            commit.operation === "create" &&
            commit.collection === "app.bsky.feed.post" &&
            commit.record &&
            (commit.record as any).$type === "app.bsky.feed.post" &&
            AppBskyFeedPost.isRecord(commit.record)
          ) {
            const text = commit.record.text || ""; 
            const cid = commit.cid?.toString() || (commit.cid as any)?.value || null;
            const uri = `at://${messageJson.did}/${commit.collection}/${commit.rkey}`;
            // console.log(uri)
            // Run both functions in parallel
            Promise.all([
              // Check if this might be a scam
              processScamMessage(messageJson.did, text, uri, cid, bot),
              // Add the message to the spam buffer for repeated-text detection
              bufferAndProcessSpam(messageJson, bot)
            ]);
          }
        } else {
          // console.error('No commit found in message:', messageJson);
        }
      } catch (err) {
        console.error("Error processing message:", err); 
      }
    });
  });

program.parse(); // Parse the command-line arguments and execute the program