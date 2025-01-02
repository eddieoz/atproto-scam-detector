import chalk from "chalk";
import { Bot } from "@skyware/bot";
import { resolveDidToHandle } from "./didResolver.js";
import { addHandleToIgnoreList, isHandleIgnored } from "./database.js";
import { getIgnoreArray } from "./ignoreWatcher.js";
import { findTrendingCoins } from "../helpers/findTrendingCoins.js";
import { evaluateWithOpenAI } from "../helpers/evaluateWithOpenAI.js";

import scamTerms from "../lists/scam_terms.js";

let allScamTerms: string[] = [];
let scamRegex: RegExp;


/**
 * Updates the list of scam terms by combining predefined scam terms in multiple languages
 * with the current trending cryptocurrency names. The function then constructs a regular
 * expression from these terms to be used for scam detection.
 *
 * The predefined scam terms include:
 * - English scam terms
 * - Spanish scam terms
 * - Portuguese scam terms
 *
 * The trending cryptocurrency names are fetched dynamically using the `findTrendingCoins` function.
 *
 * After combining all terms, the function escapes special characters in each term to ensure
 * they are treated as literals in the regular expression. The final regex is case-insensitive
 * and matches whole words only.
 *
 * The updated scam terms and the constructed regex are stored in the `allScamTerms` and `scamRegex`
 * variables, respectively.
 *
 * @returns {Promise<void>} A promise that resolves when the scam terms and regex have been updated.
 */
export async function updateScamTerms(): Promise<void> {
  const trendingCoins = await findTrendingCoins();

  allScamTerms = [
    ...scamTerms.english,
    ...scamTerms.spanish,
    ...scamTerms.portuguese,
    ...trendingCoins,
  ];
  console.log("All scam terms: ", allScamTerms.toString());

  const escapedTerms = allScamTerms
    .map((term) => term.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");

  scamRegex = new RegExp(`\\b(${escapedTerms})\\b`, "i");
}


/**
 * Searches the provided text for any scam terms using the predefined scam regex.
 * The function converts the text to lowercase to ensure case-insensitive matching
 * and then checks for matches against the scam regex. If a match is found, the
 * function returns the first matched term; otherwise, it returns null.
 *
 * @param {string} text - The text to search for scam terms.
 * @returns {string | null} - The first matched scam term if found, otherwise null.
 */
export function findScamTerm(text: string): string | null {
  const match = text.toLowerCase().match(scamRegex);
  return match ? match[0] : null;
}


/**
 * Handles the classification of a potential scam message based on the provided classification.
 * This function highlights the detected scam term in the message text and logs the detection
 * with a consistent format. It also prepares the text for further processing by extracting
 * a short version of the message.
 *
 * @param {string} classification - The classification of the message (e.g., "scam", "shilling-crypto").
 * @param {string} handle - The handle of the user who posted the message.
 * @param {string} text - The full text of the message.
 * @param {string} scamTerm - The scam term detected in the message.
 * @param {string} uri - The URI of the message.
 * @param {string | null} cid - The CID of the message, if available.
 * @param {Bot} bot - The bot instance used for applying labels or other actions.
 * @returns {Promise<void>} A promise that resolves when the classification handling is complete.
 */
async function handleScamClassification(
  classification: string,
  handle: string,
  text: string,
  scamTerm: string,
  uri: string,
  cid: string | null,
  bot: Bot
): Promise<void> {
  const shortText = text.slice(0, 100);
  const highlightedText = text.replace(
    new RegExp(`(${scamTerm})`, "gi"),
    chalk.bgYellow.bold("$1")
  );

  // Helper for consistent logging
  function logDetection(labelTitle: string): void {
    console.log(
      chalk.bgRed.bold(`\n ${labelTitle} `) +
        chalk.redBright("From ") +
        chalk.yellow(`${handle}`) +
        chalk.redBright(": ") +
        chalk.blue(`"${highlightedText}"\n`)
    );
  }

  // Helper to apply a label with the Bot API
  /**
   * Applies a label to a message or user using the bot's labeling functionality.
   * The function constructs a reference to the message or user based on the provided CID or handle.
   * If a CID is provided, the reference is constructed using the URI and CID. Otherwise, the reference
   * is constructed using the DID resolved from the handle.
   *
   * The label is applied with a comment that includes details about the auto-labeling process,
   * such as the label name, the scam term that triggered the label, the URI of the message,
   * and any additional comment details provided.
   *
   * If the labeling process fails, an error is logged with details about the failure.
   *
   * @param {string} labelName - The name of the label to apply.
   * @param {string} commentDetail - Additional details to include in the label comment.
   * @returns {Promise<void>} A promise that resolves when the label has been applied or an error has been logged.
   */
  async function applyLabel(
    labelName: string,
    commentDetail: string
  ): Promise<void> {
    try {
      await bot.label({
        reference: cid
          ? { uri, cid }
          : { did: await resolveDidToHandle(handle) },
        labels: [labelName],
        comment: `Auto-label: "${labelName}" triggered by term: "${scamTerm}"\nURI: ${uri}\n${commentDetail}`,
      });
    } catch (error) {
      console.error(
        `Failed to apply label "${labelName}" for ${handle}:`,
        error
      );
    }
  }

  switch (classification) {
    case "scam":
      logDetection("SCAM DETECTED: ACCOUNT");
      await applyLabel("potential-scam", "");
      await addHandleToIgnoreList(handle, 7);
      break;

    case "shilling-crypto":
      logDetection("SCAM DETECTED: SHILLING");
      await applyLabel("shilling-crypto", "");
      await addHandleToIgnoreList(handle, 7);
      break;

    case "fomo-inducer":
      logDetection("SCAM DETECTED: FOMO");
      await applyLabel("fomo-inducer", "");
      // (Optionally ignore handle or not)
      break;

    case "potential":
      logDetection("SCAM DETECTED: POTENTIAL");
      await applyLabel("potential-scam", "");
      // (Optionally ignore handle or not)
      break;

    case "bot-activity":
      logDetection("BOT-ACTIVITY DETECTED");
      await applyLabel("bot-activity", "");
      await addHandleToIgnoreList(handle, 30);
      break;

    default:
      // Not obviously scammy => "regular message"
      console.log(
        chalk.gray.bold("\n Regular Message ") +
          chalk.redBright("From ") +
          chalk.yellow(`${handle}`) +
          chalk.redBright(": ") +
          chalk.blue(`"${highlightedText}"\n`)
      );
      await addHandleToIgnoreList(handle, 1);
      break;
  }
}


/**
 * Processes a message to detect and handle potential scam content. The function first checks
 * the message text for known scam terms using the `findScamTerm` function. If no scam terms
 * are found, the function exits early. If a scam term is detected, the function resolves the
 * DID (Decentralized Identifier) of the message author to their handle and checks if the
 * handle is in either the static ignore list or the database-based ignore list. If the handle
 * is in either list, the message is ignored, and a log message is printed.
 *
 * If the handle is not ignored, the function constructs the URI of the message and classifies
 * the message using the `evaluateWithOpenAI` function, which analyzes the first 100 characters
 * of the message text. The classification result, along with the handle, message text, detected
 * scam term, URI, and CID (Content Identifier), is passed to the `handleScamClassification`
 * function for further processing and labeling.
 *
 * @param {string} repoDid - The DID of the repository (author) of the message.
 * @param {string} text - The text content of the message to be processed.
 * @param {string} path - The path of the message within the repository.
 * @param {string | null} cid - The CID of the message, if available.
 * @param {Bot} bot - The bot instance used for applying labels or other actions.
 * @returns {Promise<void>} A promise that resolves when the message processing is complete.
 */
export async function processScamMessage(
  repoDid: string,
  text: string,
  path: string,
  cid: string | null,
  bot: Bot
): Promise<void> {
  const scamTerm = findScamTerm(text);
  if (!scamTerm) return; // No known scam terms

  const handle = await resolveDidToHandle(repoDid);

  // Check if handle is in the static or DB-based ignore list
  if (getIgnoreArray().includes(handle)) {
    console.log(
      chalk.gray.bold(`Ignored message from ${handle} (static ignore list).`)
    );
    return;
  }
  if (await isHandleIgnored(handle)) {
    console.log(chalk.gray.bold(`Ignored message from ${handle} (DB timer).`));
    return;
  }

  const uri = `at://${repoDid}/${path}`;
  const classification = await evaluateWithOpenAI(text.slice(0, 100));

  await handleScamClassification(
    classification,
    handle,
    text,
    scamTerm,
    uri,
    cid,
    bot
  );
}
