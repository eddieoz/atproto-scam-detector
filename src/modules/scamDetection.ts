import chalk from 'chalk';
import { Bot } from '@skyware/bot';
import { resolveDidToHandle } from './didResolver.js';
import {
  addHandleToIgnoreList,
  isHandleIgnored,
} from './database.js';
import { getIgnoreArray } from './ignoreWatcher.js';
import { findTrendingCoins } from '../helpers/findTrendingCoins.js';
import { evaluateWithOpenAI } from '../helpers/evaluateWithOpenAI.js';

import scamTerms from '../lists/scam_terms.js';

let allScamTerms: string[] = [];
let scamRegex: RegExp;

/**
 * Updates the local list of scam terms, merging trending coins, etc.
 */
export async function updateScamTerms(): Promise<void> {
  const trendingCoins = await findTrendingCoins();

  allScamTerms = [
    ...scamTerms.english,
    ...scamTerms.spanish,
    ...scamTerms.portuguese,
    ...trendingCoins,
  ];
  console.log("All scam terms: ", allScamTerms.toString())

  const escapedTerms = allScamTerms
    .map((term) => term.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|');

  scamRegex = new RegExp(`\\b(${escapedTerms})\\b`, 'i');
}

/**
 * If the text contains a known scam term, return that term; otherwise null.
 */
export function findScamTerm(text: string): string | null {
  const match = text.toLowerCase().match(scamRegex);
  return match ? match[0] : null;
}

/**
 * Based on the classification from OpenAI, label the text accordingly.
 */
async function handleScamClassification(
  classification: string,
  handle: string,
  text: string,
  scamTerm: string,
  uri: string,
  cid: string | null,
  bot: Bot,
): Promise<void> {
  const shortText = text.slice(0, 100);
  const highlightedText = text.replace(
    new RegExp(`(${scamTerm})`, 'gi'),
    chalk.bgYellow.bold('$1'),
  );

  // Helper for consistent logging
  function logDetection(labelTitle: string): void {
    console.log(
      chalk.bgRed.bold(`\n ${labelTitle} `) +
        chalk.redBright('From ') +
        chalk.yellow(`${handle}`) +
        chalk.redBright(': ') +
        chalk.blue(`"${highlightedText}"\n`),
    );
  }

  // Helper to apply a label with the Bot API
  async function applyLabel(labelName: string, commentDetail: string): Promise<void> {
    try {
      await bot.label({
        reference: cid ? { uri, cid } : { did: await resolveDidToHandle(handle) },
        labels: [labelName],
        comment: `Auto-label: "${labelName}" triggered by term: "${scamTerm}"\nURI: ${uri}\n${commentDetail}`,
      });
    } catch (error) {
      console.error(`Failed to apply label "${labelName}" for ${handle}:`, error);
    }
  }

  switch (classification) {
    case 'scam':
      logDetection('SCAM DETECTED: ACCOUNT');
      await applyLabel('potential-scam', '');
      await addHandleToIgnoreList(handle, 7);
      break;

    case 'shilling-crypto':
      logDetection('SCAM DETECTED: SHILLING');
      await applyLabel('shilling-crypto', '');
      await addHandleToIgnoreList(handle, 7);
      break;

    case 'fomo-inducer':
      logDetection('SCAM DETECTED: FOMO');
      await applyLabel('fomo-inducer', '');
      // (Optionally ignore handle or not)
      break;

    case 'potential':
      logDetection('SCAM DETECTED: POTENTIAL');
      await applyLabel('potential-scam', '');
      // (Optionally ignore handle or not)
      break;

    case 'bot-activity':
      logDetection('BOT-ACTIVITY DETECTED');
      await applyLabel('bot-activity', '');
      await addHandleToIgnoreList(handle, 30);
      break;

    default:
      // Not obviously scammy => "regular message"
      console.log(
        chalk.gray.bold('\n Regular Message ') +
          chalk.redBright('From ') +
          chalk.yellow(`${handle}`) +
          chalk.redBright(': ') +
          chalk.blue(`"${highlightedText}"\n`),
      );
      await addHandleToIgnoreList(handle, 1);
      break;
  }
}

/**
 * Main function to handle checking if something is scammy or not,
 * ignoring if the user is in the static or DB-based ignore list, etc.
 */
export async function processScamMessage(
  repoDid: string,
  text: string,
  path: string,
  cid: string | null,
  bot: Bot,
): Promise<void> {
  const scamTerm = findScamTerm(text);
  if (!scamTerm) return; // No known scam terms

  const handle = await resolveDidToHandle(repoDid);

  // Check if handle is in the static or DB-based ignore list
  if (getIgnoreArray().includes(handle)) {
    console.log(chalk.gray.bold(`Ignored message from ${handle} (static ignore list).`));
    return;
  }
  if (await isHandleIgnored(handle)) {
    console.log(chalk.gray.bold(`Ignored message from ${handle} (DB timer).`));
    return;
  }

  const uri = `at://${repoDid}/${path}`;
  const classification = await evaluateWithOpenAI(text.slice(0, 100));

  await handleScamClassification(classification, handle, text, scamTerm, uri, cid, bot);
}
