import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const SYSTEM_PROMPT = process.env.SYSTEM_PROMPT;
if (!SYSTEM_PROMPT) {
  throw new Error('AI System Prompt key is missing. Please add it to the .env file.');
}
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_API_KEY) {
  throw new Error('OpenAI API key is missing. Please add it to the .env file.');
}

// Function to send the text to OpenAI GPT-4o-mini for evaluation
export async function evaluateWithOpenAI(text) {
    try {
      const response = await axios.post(
        // 'https://api.openai.com/v1/chat/completions',
        'https://api.deepseek.com/v1/chat/completions',
        {
          //model: 'gpt-4o-mini',
          model: 'deepseek-chat',
          messages: [
            {
              role: 'system',
              content: SYSTEM_PROMPT,
            },
            {
              role: 'user',
              content: text,
            },
          ],
          "stream": false,
        },
        {
          headers: {
            'Authorization': `Bearer ${OPENAI_API_KEY}`,
            'Content-Type': 'application/json',
          },
        }
      );
  
      const result = response.data.choices[0].message.content.trim().toLowerCase();
      return result.replace(/"/g, '');
    } catch (error) {
      console.error("Failed to communicate with OpenAI API:", error);
      return false;
    }
  };