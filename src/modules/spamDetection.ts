import chalk from 'chalk';
import { Bot } from '@skyware/bot';
import { AppBskyFeedPost } from '@atproto/api';
import {
  SubscribeReposMessage,
  ComAtprotoSyncSubscribeRepos,
} from 'atproto-firehose';

import { handleScamClassification } from './scamDetection.js'; // Import for potential-scam classification
import { resolveDidToHandle } from './didResolver.js';         // Resolve DID to handle

import dotenv from 'dotenv';
dotenv.config();

/**
 * AccountData interface
 */
type AccountData = {
  count: number;
  postPaths: Set<string>;
  posts: { uri: string; cid: string | null }[];
};

/**
 * text -> DID -> { count, postPaths, posts }
 */
const postTextMap = new Map<string, Map<string, AccountData>>();

// Global in-memory map to store cumulative scores
const cumulativeSpamScores = new Map<string, number>();

// Thresholds from environment variables (or defaults)
const SAME_ACCOUNT_SPAM_THRESHOLD = Number(process.env.SAME_ACCOUNT_SPAM_THRESHOLD || 3);
const MULTIPLE_ACCOUNT_SPAM_THRESHOLD = Number(process.env.MULTIPLE_ACCOUNT_SPAM_THRESHOLD || 3);
const SCAM_SPAM_THRESHOLD = Number(process.env.SCAM_SPAM_THRESHOLD || 5);

let isProcessing = false;

export async function processBufferedMessages(
  messages: SubscribeReposMessage[],
  bot: Bot
): Promise<void> {
  if (isProcessing) return;
  isProcessing = true;

  // Clear the map for each fresh batch
  postTextMap.clear();

  // -------------------------------------
  // PASS #1: Build up postTextMap
  // -------------------------------------
  for (const message of messages) {
    if (!ComAtprotoSyncSubscribeRepos.isCommit(message)) continue;

    for (const op of message.ops) {
      if (
        op.action === 'create' &&
        op.payload &&
        (op.payload as any).$type === 'app.bsky.feed.post' &&
        AppBskyFeedPost.isRecord(op.payload)
      ) {
        const text = op.payload.text || '';
        if (text.trim().split(/\s+/).length <= 4) continue;

        const uri = `at://${message.repo}/${op.path}`;
        const cid = op.cid?.toString() || (op.cid as any)?.value || null;

        let didMap = postTextMap.get(text);
        if (!didMap) {
          didMap = new Map<string, AccountData>();
          postTextMap.set(text, didMap);
        }

        let accountData = didMap.get(message.repo);
        if (!accountData) {
          accountData = { count: 0, postPaths: new Set(), posts: [] };
          didMap.set(message.repo, accountData);
        }

        if (!accountData.postPaths.has(op.path)) {
          accountData.postPaths.add(op.path);
          accountData.count += 1;
          accountData.posts.push({ uri, cid });
        }
      }
    }
  }

  // -------------------------------------
  // PASS #2: Check thresholds & label
  // -------------------------------------
  for (const [text, didMap] of postTextMap.entries()) {
    // Check if multiple accounts posted this text
    if (didMap.size >= MULTIPLE_ACCOUNT_SPAM_THRESHOLD) {
      let allPosts: { uri: string; cid: string | null }[] = [];
      const allDids: string[] = [];

      for (const [did, accountData] of didMap.entries()) {
        allDids.push(did);
        allPosts = allPosts.concat(accountData.posts);
      }

      for (const post of allPosts) {
        try {
          await bot.label({
            reference: { uri: post.uri, cid: post.cid },
            labels: ['spam'],
            comment: `Auto-label SPAM (multiple accounts, same text) for URI: ${post.uri}`,
          });
        } catch (error) {
          console.error(`Error labeling spam for post ${post.uri}`, error);
        }
      }

      console.log(
        chalk.bgRed.bold('\n SPAM DETECTED ') +
          chalk.redBright('The phrase ') +
          chalk.blue(`“${text}” `) +
          chalk.green('was posted by multiple accounts: ') +
          chalk.yellow(allDids.join(', ')) +
          chalk.redBright('.\n')
      );
    }

    // Check each DID for repeated text (same account)
    for (const [did, accountData] of didMap.entries()) {
      // Update cumulative score for the account
      let currentScore = cumulativeSpamScores.get(did) || 0;
      let updatedScore = 0;
      if (accountData.count >= SAME_ACCOUNT_SPAM_THRESHOLD) { 
        let updatedScore = currentScore + accountData.count;
        cumulativeSpamScores.set(did, updatedScore);

        for (const post of accountData.posts) {
          try {
            await bot.label({
              reference: { uri: post.uri, cid: post.cid },
              labels: ['spam'],
              comment: `Auto-label SPAM (same account repeated text) for URI: ${post.uri}`,
            });
            
          } catch (error) {
            console.error(`Error labeling spam for DID ${did}`, error);
          }
        }

        console.log(
          chalk.bgRed.bold('\n SPAM DETECTED ') +
            chalk.redBright('The phrase ') +
            chalk.blue(`“${text}” `) +
            chalk.green(`was repeatedly posted ${accountData.count} times by `) +
            chalk.yellow(did) +
            chalk.redBright(`: score ${updatedScore}.\n`)
        );
      }
      // Check if the cumulative score exceeds the SCAM_SPAM_THRESHOLD
      if (currentScore > SCAM_SPAM_THRESHOLD) {
        try {
          // Label account
          await bot.label({
            reference: { did: did },
            labels: ['spam'],
            comment: `Auto-label SPAM (same account repeated text) over ${updatedScore} times, threshold = ${SCAM_SPAM_THRESHOLD}.`,
          });
                    
          console.log(
            chalk.bgMagenta.bold('\n POTENTIAL SCAM DETECTED ') +
              chalk.magentaBright(`Account ${did} posted the same text `) +
              chalk.blue(`“${text}” `) +
              chalk.magentaBright(`over ${updatedScore} times, threshold = ${SCAM_SPAM_THRESHOLD}.\n`)
          );

          // Reset score after labeling
          currentScore = 0;
          updatedScore = 0;
          cumulativeSpamScores.set(did, 0);
        } catch (error) {
          console.error(`Error labeling spam for DID ${did}`, error);
        }
      }
    }
  }

  isProcessing = false;
}
