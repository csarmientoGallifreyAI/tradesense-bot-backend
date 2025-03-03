import { config } from 'dotenv';
import { Client } from '@gradio/client';
import gradioService from '../services/ai/gradioService';

// Load environment variables
config();

/**
 * Test script for the Gradio client integration with Hugging Face Spaces
 *
 * This script demonstrates how to use the Gradio client to interact with
 * a Gradio-based Hugging Face Space, specifically the kk08-CryptoBERT model.
 *
 * To run this script:
 * 1. Ensure you have a .env file with HUGGINGFACE_API_TOKEN (and optionally GRADIO_CRYPTOBERT_SPACE_ID)
 * 2. Run: npx ts-node tests/gradio-client-test.ts
 *
 * The script will:
 * - Test connecting directly to the Gradio Space using the @gradio/client
 * - Test using our gradioService wrapper to analyze sentiment
 */
async function main() {
  console.log('=== Testing Gradio Client Integration ===');

  try {
    // Part 1: Direct Client usage
    console.log('\n1. Testing direct Gradio client usage:');

    const hfToken = process.env.HUGGINGFACE_API_TOKEN;
    if (!hfToken) {
      console.warn('Warning: No HUGGINGFACE_API_TOKEN found in environment variables.');
      console.warn('Connections may be rate-limited or fail if the Space requires authentication.');
    }

    const spaceId = process.env.GRADIO_CRYPTOBERT_SPACE_ID || 'csarmiento/kk08-CryptoBERT';
    console.log(`Connecting to Gradio Space: ${spaceId}`);

    // Connect to the Space
    const client = await Client.connect(
      spaceId,
      hfToken
        ? {
            hf_token: hfToken.startsWith('hf_')
              ? (hfToken as `hf_${string}`)
              : (`hf_${hfToken}` as `hf_${string}`),
          }
        : undefined
    );

    console.log('Successfully connected to Gradio Space');

    // Analyze a sample text
    const sampleText =
      'Bitcoin is showing strong recovery signals after the recent market correction. The trading volume has increased significantly.';
    console.log(`Analyzing text: "${sampleText.substring(0, 50)}..."`);

    const result = await client.predict('/predict', {
      param_0: sampleText,
    });

    console.log('Raw result from Gradio Space:');
    console.log(JSON.stringify(result.data, null, 2));

    // Part 2: Using our service wrapper
    console.log('\n2. Testing gradioService wrapper:');

    console.log('Analyzing the same text using our service wrapper...');
    const sentimentResult = await gradioService.analyzeSentiment(sampleText);

    console.log('Processed result:');
    console.log(JSON.stringify(sentimentResult, null, 2));

    // Optional: Load an example from the Space if available
    try {
      console.log('\n3. Loading example from Space (if available):');
      const example = await gradioService.loadExample();
      console.log('Example data:');
      console.log(JSON.stringify(example, null, 2));
    } catch (error) {
      console.log('Example loading not supported or failed:', (error as Error).message);
    }

    console.log('\n=== Test completed successfully ===');
  } catch (error) {
    console.error('Error during Gradio client test:', (error as Error).message);
    if (error instanceof Error && error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Run the test
main().catch((error) => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
