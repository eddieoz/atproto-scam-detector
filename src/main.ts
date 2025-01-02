#!/usr/bin/env ts-node

import dotenv from 'dotenv';
import chalk from 'chalk';
import { program } from 'commander';
import { CronJob } from 'cron';
import { subscribeRepos, SubscribeReposMessage, ComAtprotoSyncSubscribeRepos } from 'atproto-firehose';
import { AppBskyFeedPost } from '@atproto/api';

import { initializeDatabase } from './modules/database';
import { initializeBotSession, getBotInstance } from './modules/botSession';
import { processBufferedMessages } from './modules/spamDetection';
import { updateScamTerms, processScamMessage } from './modules/scamDetection';
import { loadIgnoreArray } from './modules/ignoreWatcher';

import { Bot } from '@skyware/bot';
import { isHandleInMemoryIgnored } from './modules/memDatabase';


dotenv.config();

// Time window (seconds) for spam detection aggregator
const TIME_WINDOW_SEC = parseInt(process.env.TIME_WINDOW || '60', 10);
const TIME_WINDOW_MS = TIME_WINDOW_SEC * 1000;

// For buffering spam detection
let messageBuffer: SubscribeReposMessage[] = [];
let spamTimer: NodeJS.Timeout | null = null;

/**
 * Safely process buffered spam messages (clearing interval when done).
 */
async function bufferAndProcessSpam(
  message: SubscribeReposMessage[],
  botInstance: Bot,
) {
  if (isHandleInMemoryIgnored(message.repo)) {
    console.log(chalk.gray.bold(`Ignored message from ${message.repo} (in-memory ignore list).`));
    return;
  }
  messageBuffer.push(message);
  if (!spamTimer) {
    spamTimer = setInterval(async () => {
      const localBuffer = [...messageBuffer];
      messageBuffer.length = 0;
      await processBufferedMessages(localBuffer, botInstance);
    }, TIME_WINDOW_MS);
  }
}

program
  .name('real-time-scam-detector')
  .description('Detects scam messages in real time')
  .argument('<host>', 'PDS/BGS host')
  .action(async (host) => {
    console.log(chalk.green('Initializing system...'));
    await initializeDatabase();
    const bot = await initializeBotSession();
    await loadIgnoreArray();

    console.log(chalk.green('Updating scam terms initially...'));
    await updateScamTerms();

    // Setup a cron job to refresh scam terms periodically
    const cronJob = new CronJob('0 */1 * * *', async () => {
      console.log('Cron job: Updating scam terms...');
      await updateScamTerms();
    });
    cronJob.start();

    console.log(chalk.green(`Subscribing to repo events on wss://${host} ...`));
    const subscription = subscribeRepos(`wss://${host}`, {
      decodeRepoOps: true,
    });

    subscription.on('error', (error) => {
      console.error('Subscription error:', error);
    });

    subscription.on('close', () => {
      console.log('Connection closed');
      if (spamTimer) {
        clearInterval(spamTimer);
      }
    });

    subscription.on('message', async (message: SubscribeReposMessage) => {
      try {
        if (!ComAtprotoSyncSubscribeRepos.isCommit(message)) return;

        for (const op of message.ops) {
          if (
            op.action === 'create' &&
            op.payload &&
            (op.payload as any).$type === 'app.bsky.feed.post' &&
            AppBskyFeedPost.isRecord(op.payload)
          ) {
            const text = op.payload.text || '';
            // Add to spam buffer for repeated-text detection
            await bufferAndProcessSpam(message, bot)
            
            // Check if this might be a scam
            const cid = op.cid?.toString() || (op.cid as any)?.value || null;
            await processScamMessage(message.repo, text, op.path, cid, bot);
          }
        }
      } catch (err) {
        console.error('Error processing message:', err);
      }
    });
  });

program.parse();
