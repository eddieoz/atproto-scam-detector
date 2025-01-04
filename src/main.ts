#!/usr/bin/env ts-node

import dotenv from "dotenv";
import chalk from "chalk";
import { program } from "commander";
import { CronJob } from "cron";
import {
  subscribeRepos,
  SubscribeReposMessage,
  ComAtprotoSyncSubscribeRepos,
} from "atproto-firehose";
import { AppBskyFeedPost } from "@atproto/api";

import { initializeDatabase } from "./modules/database";
import { initializeBotSession, getBotInstance } from "./modules/botSession";
import { processBufferedMessages } from "./modules/spamDetection";
import { updateScamTerms, processScamMessage } from "./modules/scamDetection";
import { loadIgnoreArray } from "./modules/ignoreWatcher";

import { Bot } from "@skyware/bot";
import { isHandleInMemoryIgnored } from "./modules/memDatabase";

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
  if (isHandleInMemoryIgnored(message.repo)) {
    console.log(
      chalk.gray.bold(
        `Ignored message from ${message.repo} (in-memory ignore list).`
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
    const subscription = subscribeRepos(`wss://${host}`, {
      decodeRepoOps: true, 
    });

    // Handle subscription errors
    subscription.on("error", (error) => {
      console.error("Subscription error:", error);
    });

    // Handle subscription close events
    subscription.on("close", () => {
      console.log("Connection closed");
      if (spamTimer) {
        clearInterval(spamTimer); 
      }
    });

    // Handle incoming messages from the subscription
    subscription.on("message", async (message: SubscribeReposMessage) => {
      try {
        // Check if the message is a commit
        if (!ComAtprotoSyncSubscribeRepos.isCommit(message)) return;

        // Iterate over the operations in the commit
        for (const op of message.ops) {
          // Check if the operation is a create action and the payload is a post
          if (
            op.action === "create" &&
            op.payload &&
            (op.payload as any).$type === "app.bsky.feed.post" &&
            AppBskyFeedPost.isRecord(op.payload)
          ) {
            const text = op.payload.text || ""; 
            const cid = op.cid?.toString() || (op.cid as any)?.value || null; 

            // Run both functions in parallel
            await Promise.all([
              // Check if this might be a scam
              processScamMessage(message.repo, text, op.path, cid, bot),
              // Add the message to the spam buffer for repeated-text detection
              bufferAndProcessSpam(message, bot)
            ]);
          }
        }
      } catch (err) {
        console.error("Error processing message:", err); 
      }
    });
  });

program.parse(); // Parse the command-line arguments and execute the program
