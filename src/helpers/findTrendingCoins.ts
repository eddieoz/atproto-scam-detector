/**
 * Fetches and returns the names of trending coins, NFTs, and coins with the highest market cap.
 * 
 * This function makes two API calls to the CoinGecko API:
 * 1. Fetches trending coins and NFTs.
 * 2. Fetches coins with the highest market cap.
 * 
 * The function combines the names of the trending coins, NFTs, and market cap coins into a single array.
 * 
 * @returns {Promise<string[]>} A promise that resolves to an array of strings containing the names of trending coins, NFTs, and market cap coins.
 * @throws {Error} If there is an error during the API fetch process, the error is logged and re-thrown.
 */
export async function findTrendingCoins() {
  // Log a message to indicate the start of the function
  console.log('Loading trending coins...');
  
  // Define the URLs for fetching trending coins and market cap data
  const urlTrending = 'https://api.coingecko.com/api/v3/search/trending'; 
  const urlMktCap = 'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&per_page=30';

  // Define the options for the fetch request, including method and headers
  const options = { method: 'GET', headers: { accept: 'application/json' } };

  try {
    // Fetch trending coins data from the API
    const responseTrending = await fetch(urlTrending, options);
    // Parse the response as JSON
    const jsonTrending = await responseTrending.json();

    // Extract the names of the trending coins from the JSON response
    const coinNames = jsonTrending?.coins?.map((coin) => coin.item.name) || [];

    // Extract the names of the trending NFTs from the JSON response
    const nftNames = jsonTrending?.nfts?.map((nft) => nft.name) || [];

    // Fetch market cap data from the API
    const responseMktCap = await fetch(urlMktCap, options);
    // Parse the response as JSON
    const jsonMktCap = await responseMktCap.json(); 
    // Extract the names of the coins from the market cap data
    const coinNamesMktCap = jsonMktCap?.map(coin => coin.name) || [];

    // Return an array containing all the extracted names (coins, NFTs, and market cap coins)
    return [
      ...coinNames, 
      ...nftNames, 
      ...coinNamesMktCap
    ];
  } catch (error) {
    // Log any errors that occur during the fetch process
    console.error('Error fetching trending coins:', error);
    // Re-throw the error to allow the caller to handle it if needed
    throw error;
  }
}
