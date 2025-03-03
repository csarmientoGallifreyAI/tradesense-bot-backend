import { HfInference } from '@huggingface/inference';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

/**
 * This is a simple test script to demonstrate how to use the Hugging Face Inference client
 * with your CryptoBERT model or any other text classification model.
 *
 * To run this test:
 * 1. Make sure you have a .env file with your HUGGINGFACE_API_TOKEN
 * 2. Run: ts-node tests/huggingface-test.ts
 */
async function main() {
  // Get the API token
  const apiToken = process.env.HUGGINGFACE_API_TOKEN;
  if (!apiToken) {
    console.error('Error: HUGGINGFACE_API_TOKEN not found in environment variables');
    process.exit(1);
  }

  try {
    // Initialize the Hugging Face Inference client
    const hf = new HfInference(apiToken);
    console.log('Hugging Face Inference client initialized successfully');

    // Specify your model
    const model = 'csarmiento/k80x-CryptoBERT'; // Replace with your actual model ID

    // Sample input text
    const sampleText = 'Bitcoin has shown strong resistance above $50,000 with high trading volume';

    console.log(`\nRunning classification on text: "${sampleText}"`);
    console.log(`Using model: ${model}`);

    // Call your model for text classification
    const result = await hf.textClassification({
      model: model,
      inputs: sampleText,
    });

    console.log('\nClassification result:');
    console.log(JSON.stringify(result, null, 2));

    // If you want to try text generation with a different model
    // Uncomment this section and replace the model ID
    /*
    console.log('\nRunning text generation with a different model...');
    const generationModel = 'gpt2'; // Replace with your model for text generation
    const generationResult = await hf.textGeneration({
      model: generationModel,
      inputs: 'The crypto market is',
      parameters: {
        max_new_tokens: 50,
        return_full_text: false
      }
    });

    console.log('\nGeneration result:');
    console.log(JSON.stringify(generationResult, null, 2));
    */
  } catch (error) {
    console.error('Error occurred:', error);
    if (error instanceof Error) {
      console.error(`Message: ${error.message}`);
      console.error(`Stack: ${error.stack}`);
    }
  }
}

// Run the main function
main().catch(console.error);
