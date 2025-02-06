import axios from "axios";
import dotenv from "dotenv";

// Load environment variables from .env file
dotenv.config();

// Retrieve the AI system prompt from environment variables
const SYSTEM_PROMPT = process.env.SYSTEM_PROMPT;
// Throw an error if the system prompt is missing
if (!SYSTEM_PROMPT) {
  throw new Error(
    "AI System Prompt key is missing. Please add it to the .env file."
  );
}

// Retrieve the OpenAI API key from environment variables
const AI_API_KEY = process.env.AI_API_KEY;
const AI_ENDPOINT = process.env.AI_ENDPOINT;
const AI_MODEL = process.env.AI_MODEL;

// Throw an error if the API key is missing
if (!AI_API_KEY) {
  throw new Error("OpenAI API key is missing. Please add it to the .env file.");
}

/**
 * Sends the provided text to the OpenAI GPT-4o-mini (or DeepSeek-V3) API for evaluation.
 * 
 * This function constructs a POST request to the specified API endpoint, using the system prompt
 * defined in the environment variables and the user-provided text. It then processes the API response
 * to extract and clean the evaluation result.
 * 
 * @param {string} text - The text to be evaluated by the AI model.
 * @returns {Promise<string | boolean>} - A promise that resolves to the cleaned evaluation result (string)
 * if the API call is successful. If the API call fails, the function returns `false`.
 * 
 * @throws {Error} - Throws an error if the API call fails, and logs the error to the console.
 */
export async function evaluateWithOpenAI(text) {
  try {
    // Make a POST request to the OpenAI API (or DeepSeek-V3 using the same interface)
    const response = await axios.post(
      `${AI_ENDPOINT}`,
      {
        model: `${AI_MODEL}`,
        messages: [
          {
            role: "system",
            content: SYSTEM_PROMPT,
          },
          {
            role: "user",
            content: text,
          },
        ],
        stream: false,
      },
      {
        headers: {
          Authorization: `Bearer ${AI_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    // Extract and clean the response content
    const result = response.data.choices[0].message.content
      .trim()
      .toLowerCase();
    return result.replace(/"/g, "");
  } catch (error) {
    // Log any errors that occur during the API call
    console.error("Failed to communicate with OpenAI API:", error);
    return false;
  }
}
