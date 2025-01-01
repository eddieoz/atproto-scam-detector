import { Bot } from '@skyware/bot';
import chalk from 'chalk';
import { AppBskyFeedPost } from '@atproto/api';
import {
  SubscribeReposMessage,
  ComAtprotoSyncSubscribeRepos,
} from 'atproto-firehose';
import { getIgnoreArray } from './ignoreWatcher.js';
import { resolveDidToHandle } from './didResolver.js';

// We'll store a map of text => array of { did, uri, cid }
const postTextToAccounts = new Map<string, { did: string; uri: string; cid: string | null }[]>();
let isProcessing = false;

/**
 * Process buffered messages, labeling spammy text that comes from multiple accounts.
 */
export async function processBufferedMessages(
  messages: SubscribeReposMessage[],
  bot: Bot,
): Promise<void> {
  if (isProcessing) return;
  isProcessing = true;

  // Clear the tracking map on each batch
  postTextToAccounts.clear();

  for (const message of messages) {
    if (!ComAtprotoSyncSubscribeRepos.isCommit(message)) continue;

    for (const op of message.ops) {
      if (
        op.action === 'create' &&
        op.payload &&
        (op.payload as any).$type === 'app.bsky.feed.post' &&
        AppBskyFeedPost.isRecord(op.payload)
      ) {
        // const handle = await resolveDidToHandle(message.repo);
        // // Check if handle is in the static or DB-based ignore list
        // if (getIgnoreArray().includes(handle)) {
        //   console.log(chalk.gray.bold(`Ignored message from ${handle} (static spam ignore list).`));
        //   return;
        // }
        const text = op.payload.text || '';
        // Skip posts with fewer than 5 words
        if (text.trim().split(/\s+/).length <= 4) continue;

        const uri = `at://${message.repo}/${op.path}`;
        const cid = op.cid?.toString() || (op.cid as any)?.value || null;

        const accounts = postTextToAccounts.get(text) || [];
        // Only add if not already present
        if (!accounts.some((a) => a.did === message.repo)) {
          accounts.push({ did: message.repo, uri, cid });
        }
        postTextToAccounts.set(text, accounts);

        // If this text has come from 2 or more accounts => label them all as spam
        if (accounts.length > 1) {
          const joinedDids = accounts.map((acc) => acc.did).join(', ');

          for (const account of accounts) {
            try {
              await bot.label({
                reference: { uri: account.uri, cid: account.cid },
                labels: ['spam'],
                comment: `Auto-label SPAM URI: ${account.uri}`,
              });
            } catch (error) {
              console.error(`Error labeling spam for DID ${account.did}`, error);
            }
          }

          // Clear accounts so we don’t repeatedly label them if more messages have same text
          accounts.length = 0;

          console.log(
            chalk.bgRed.bold('\n SPAM DETECTED ') +
              chalk.redBright('The phrase ') +
              chalk.blue(`“${text}” `) +
              chalk.green('was posted by ') +
              chalk.yellow(`${joinedDids}`) +
              chalk.redBright('.\n'),
          );
        }
      }
    }
  }

  isProcessing = false;
}
