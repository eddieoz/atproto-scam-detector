// /home/eddieoz/Projects/git/atproto-scam-detector/src/modules/spamDetection.ts

import chalk from "chalk";
import { Bot } from "@skyware/bot";
import { AppBskyFeedPost } from "@atproto/api";
import { SubscribeReposMessage } from "atproto-firehose";

import dotenv from "dotenv";
import { addHandleToMemoryIgnoreList } from "./memDatabase";
dotenv.config();

// Interface to define the structure of account data
type AccountData = {
  count: number; // Number of posts with the same text
  postPaths: Set<string>; // Unique paths of posts
  posts: { uri: string; cid: string | null }[]; // Array of post URIs and CIDs
};

// Map to store post text and associated account data
const postTextMap = new Map<string, Map<string, AccountData>>();

// Map to store cumulative spam scores for accounts
const cumulativeSpamScores = new Map<string, number>();

// Thresholds for spam detection from environment variables or defaults
const SAME_ACCOUNT_SPAM_THRESHOLD = Number(
  process.env.SAME_ACCOUNT_SPAM_THRESHOLD || 3
);
const MULTIPLE_ACCOUNT_SPAM_THRESHOLD = Number(
  process.env.MULTIPLE_ACCOUNT_SPAM_THRESHOLD || 3
);
const SCAM_SPAM_THRESHOLD = Number(process.env.SCAM_SPAM_THRESHOLD || 5);

// Flag to prevent concurrent processing
let isProcessing = false;

/**
 * Processes a batch of messages from the repository subscription feed to detect and label spam.
 *
 * This function performs two passes over the messages:
 *
 * 1. **Pass #1: Build up `postTextMap`**  
 *    Iterates through the messages to populate a map (`postTextMap`) that associates post text with account data.  
 *    The map structure is: `Map<text, Map<did, AccountData>>`, where:  
 *    - `text` is the content of the post.  
 *    - `did` is the decentralized identifier (DID) of the account.  
 *    - `AccountData` contains the count of posts, unique post paths, and post URIs/CIDs.  
 *    Posts with fewer than 5 words are ignored.  
 *
 * 2. **Pass #2: Check thresholds & label**  
 *    Iterates through `postTextMap` to detect spam based on predefined thresholds:  
 *    - **Multiple Accounts Spam**: If the same text is posted by multiple accounts (exceeding `MULTIPLE_ACCOUNT_SPAM_THRESHOLD`), all posts with that text are labeled as spam.  
 *    - **Same Account Spam**: If an account posts the same text repeatedly (exceeding `SAME_ACCOUNT_SPAM_THRESHOLD`), the posts are labeled as spam, and the account's cumulative spam score is updated.  
 *    - **Scam Spam**: If an account's cumulative spam score exceeds `SCAM_SPAM_THRESHOLD`, the account is labeled as spam, added to the ignore list, and its score is reset.  
 * 
 * The function ensures no concurrent processing by using a flag (`isProcessing`).
 *
 * @param messages - An array of `SubscribeReposMessage` objects representing the messages to process.
 * @param bot - An instance of the `Bot` class used to label spam posts and accounts.
 * @returns A promise that resolves when the processing is complete.
 */
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
    // Now we should check the structure of `message` as per the latest definition
    if (message.commit) { // Check if there is a commit present
      const op = message.commit;
      // console.log(message)

      // Check if the operation is a create action
      if (
        op.operation === "create" &&
        op.collection === "app.bsky.feed.post" &&
        op.record &&
        (op.record as any).$type === "app.bsky.feed.post" &&
        AppBskyFeedPost.isRecord(op.record)
      ) {
        const text = op.record.text || "";
        if (text.trim().split(/\s+/).length < 5) continue; // Ignore posts with fewer than 5 words

        const uri = `at://${message.did}/${op.collection}/${op.rkey}`;
        const cid = op.cid?.toString() || (op.cid as any)?.value || null;

        let didMap = postTextMap.get(text);
        if (!didMap) {
          didMap = new Map<string, AccountData>();
          postTextMap.set(text, didMap);
        }

        let accountData = didMap.get(message.did);
        if (!accountData) {
          accountData = { count: 0, postPaths: new Set(), posts: [] };
          didMap.set(message.did, accountData);
        }

        if (!accountData.postPaths.has(op.rkey)) {
          accountData.postPaths.add(op.rkey);
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
            labels: ["spam"],
            comment: `Auto-label SPAM (multiple accounts, same text) for URI: ${post.uri}`,
          });
        } catch (error) {
          console.error(`Error labeling spam for post ${post.uri}`, error);
        }
      }

      console.log(
        chalk.bgRed.bold("\n SPAM DETECTED ") +
          chalk.redBright("The phrase ") +
          chalk.blue(`“${text}” `) +
          chalk.green("was posted by multiple accounts: ") +
          chalk.yellow(allDids.join(", ")) +
          chalk.redBright(".\n")
      );
    }

    // Check each DID for repeated text (same account)
    for (const [did, accountData] of didMap.entries()) {
      // Update cumulative score for the account
      let currentScore = cumulativeSpamScores.get(did) || 0;
      let updatedScore = 0;

      if (accountData.count >= SAME_ACCOUNT_SPAM_THRESHOLD) {
        updatedScore = currentScore + accountData.count;
        cumulativeSpamScores.set(did, updatedScore);
        
        for (const post of accountData.posts) {
          try {
            await bot.label({
              reference: { uri: post.uri, cid: post.cid },
              labels: ["spam"],
              comment: `Auto-label SPAM (same account repeated text) for URI: ${post.uri}`,
            });
          } catch (error) {
            console.error(`Error labeling spam for DID ${did}`, error);
          }
        }

        console.log(
          chalk.bgRed.bold("\n SPAM DETECTED ") +
            chalk.redBright("The phrase ") +
            chalk.blue(`“${text}” `) +
            chalk.green(
              `was repeatedly posted ${accountData.count} times by `
            ) +
            chalk.yellow(did) +
            chalk.redBright(`: score ${updatedScore}.\n`)
        );
      }

      // Check if the cumulative score exceeds the SCAM_SPAM_THRESHOLD
      if (updatedScore > SCAM_SPAM_THRESHOLD) {
        try {
          // Label account
          await bot.label({
            reference: { did: did },
            labels: ["spam"],
            comment: `Auto-label SPAM (same account repeated text) over ${currentScore} times, threshold = ${SCAM_SPAM_THRESHOLD} Text: ${text}`,
          });

          await addHandleToMemoryIgnoreList(did, 7);

          console.log(
            chalk.bgMagenta.bold("\n POTENTIAL SCAM DETECTED ") +
              chalk.magentaBright(`Account ${did} posted the same text `) +
              chalk.blue(`“${text}” `) +
              chalk.magentaBright(
                `over ${currentScore} times, threshold = ${SCAM_SPAM_THRESHOLD}.\n`
              )
          );

          // Reset score after labeling
          cumulativeSpamScores.set(did, 0);
        } catch (error) {
          console.error(`Error labeling spam for DID ${did}`, error);
        }
      }
    }
  }

  isProcessing = false;
}