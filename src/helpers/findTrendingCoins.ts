// findTrendingCoins.js
export async function findTrendingCoins() {
  console.log('Loading trending coins...');
  const urlTrending = 'https://api.coingecko.com/api/v3/search/trending'; 
  const urlMktCap = 'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&per_page=30';

  const options = { method: 'GET', headers: { accept: 'application/json' } };

  try {
    const responseTrending = await fetch(urlTrending, options);
    const jsonTrending = await responseTrending.json();

    // Extract coin names
    const coinNames = jsonTrending?.coins?.map((coin) => coin.item.name) || [];

    // Extract NFT names
    const nftNames = jsonTrending?.nfts?.map((nft) => nft.name) || [];

    const responseMktCap = await fetch(urlMktCap, options);
    const jsonMktCap = await responseMktCap.json(); 
    const coinNamesMktCap = jsonMktCap?.map(coin => coin.name) || [];


    // console.log('Coin Names:', coinNames);
    // console.log('NFT Names:', nftNames);

    // Return them so the caller can use them
    return [
      ...coinNames, 
      ...nftNames, 
      ...coinNamesMktCap
    ];
  } catch (error) {
    console.error('Error fetching trending coins:', error);
    // Throw the error so it can be handled by the caller if desired
    throw error;
  }
}
