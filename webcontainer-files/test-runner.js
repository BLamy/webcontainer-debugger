// Simple script that runs vitest and exposes the debug steps
import { startVitest } from 'vitest/node';

// This will be run by the WebContainer
async function runTests() {
  try {
    // Run vitest with only the custom reporter
    const vitest = await startVitest('test', [], {
      run: true,
      watch: false,
    });
    
    // Run tests. The reporter will print the debug steps via console.log.
    await vitest.start();
    
    // No need to return or log anything here; the reporter handles it.
  } catch (e) {
    console.error('Test runner error:', e);
    // Avoid printing the marker here on error, as it might interfere
  }
}

// Just run the tests. The reporter handles the final output.
runTests();