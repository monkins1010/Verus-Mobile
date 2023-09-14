import { ethers } from "ethers";
import VrpcProvider from "../../../../vrpc/vrpcInterface"
import { getCurrenciesMappedToEth } from "./getCurrenciesMappedToEth";
import { ETH_BRIDGE_NAME, ETH_CONTRACT_ADDRESS, VETH } from "../../../../constants/web3Constants";
import { getWeb3ProviderForNetwork } from "../../../../web3/provider";

export const getCurrencyConversionPaths = async (systemId, src, ethNetwork) => {
  const ethSrc = src === ETH_CONTRACT_ADDRESS || ethers.utils.isAddress(src);
  const endpoint = VrpcProvider.getEndpoint(systemId);

  if (ethSrc) {
    const isEth = src === ETH_CONTRACT_ADDRESS;
    const paths = {};
    const mappedCurrenciesResponse = await getCurrenciesMappedToEth(systemId, ethNetwork);

    if (mappedCurrenciesResponse.error) throw new Error(sourceResponse.error.message);

    // Determine which currencies can be converted
    const bridgeCurrencyResponse = await endpoint.getCurrency(ETH_BRIDGE_NAME);
    if (bridgeCurrencyResponse.error) throw new Error(bridgeCurrencyResponse.error.message);
    const bridgeCurrencyDefinition = bridgeCurrencyResponse.result;
    const { currencies: convertableCurrencies } = bridgeCurrencyDefinition;

    const {contractAddressToCurrencyDefinitionMap, currencyIdToContractAddressMap} = mappedCurrenciesResponse.result;

    if (contractAddressToCurrencyDefinitionMap.has(src)) {
      const mappedToSource = contractAddressToCurrencyDefinitionMap.get(src);

      const systemCurrencyResponse = await endpoint.getCurrency(systemId);
  
      if (systemCurrencyResponse.error) throw new Error(systemCurrencyResponse.error.message);
  
      const systemDefinition = systemCurrencyResponse.result;

      // Establish which currencies the ETH currency can be mapped to
      for (const [key, currency] of mappedToSource) {
        const { currencydefinition } = currency;
        const { nativecurrencyid, currencyid } = currencydefinition;
        const { bestcurrencystate } = bridgeCurrencyDefinition;
        const { currencies: convertableCurrencyStates } = bestcurrencystate;
        const isBridge = currencyid === bridgeCurrencyDefinition.currencyid;

        // If mapped to a currency that can be converted through the bridge or is the bridge
        if (
          isEth ||
          (convertableCurrencies.includes(currencyid) || isBridge)
        ) {
          // You can always convert to the bridge if you're convertable, unless you're the bridge
          if (!isBridge) {
            const priceData = convertableCurrencyStates[currencyid];

            paths[bridgeCurrencyDefinition.currencyid] = [{
              destination: bridgeCurrencyDefinition,
              exportto: systemDefinition,
              price: 1 / priceData.lastconversionprice,
              gateway: true
            }];
          }

          for (const convertableCurrencyId of convertableCurrencies) {
            paths[convertableCurrencyId] = [];

            const convertableCurrencyResponse = await endpoint.getCurrency(convertableCurrencyId);
            if (convertableCurrencyResponse.error) throw new Error(convertableCurrencyResponse.error.message);
            const convertableCurrencyDefinition = convertableCurrencyResponse.result;

            const erc20sMappedToCurrency = currencyIdToContractAddressMap.get(convertableCurrencyDefinition.currencyid);

            if (isBridge) {
              // If you are the bridge, you can convert to all of the bridge reserve currencies
              const priceData = convertableCurrencyStates[convertableCurrencyId];

              // You can convert to VRSC network
              paths[convertableCurrencyId].push({
                destination: convertableCurrencyDefinition,
                exportto: systemDefinition,
                price: priceData.lastconversionprice,
                gateway: true
              });

              // Or bounce back to ETH through any currency mapped to your destination
              for (const contractAddress of erc20sMappedToCurrency) {
                paths[contractAddress] = []

                try {
                  if (contractAddress !== ETH_CONTRACT_ADDRESS) {
                    const contract = getWeb3ProviderForNetwork(ethNetwork).getUnitializedContractInstance(contractAddress);
                    const name = await contract.name();
                    const symbol = await contract.symbol();
                    const decimals = await contract.decimals();
  
                    paths[contractAddress].push({
                      via: convertableCurrencyDefinition,
                      destination: {
                        address: contractAddress,
                        symbol,
                        decimals,
                        name,
                        mapto: convertableCurrencyDefinition
                      },
                      price: priceData.lastconversionprice,
                      gateway: true,
                      bounceback: true,
                      ethdest: true
                    });
                  } else {
                    paths[ETH_CONTRACT_ADDRESS].push({
                      via: convertableCurrencyDefinition,
                      destination: {
                        address: ETH_CONTRACT_ADDRESS,
                        symbol: "ETH",
                        decimals: 18,
                        name: "Ethereum",
                        mapto: convertableCurrencyDefinition
                      },
                      price: priceData.lastconversionprice,
                      gateway: true,
                      bounceback: true,
                      ethdest: true
                    });
                  }
                } catch(e) {
                  console.log("Error fetching information for contract " + contractAddress)
                  console.warn(e)
                }
              }
            } else if (convertableCurrencyId !== currencyid) {
              // If you're convertable and not the bridge, you can convert to either the bridge (above)
              // or any of the bridge reserve currencies except for yourself via the bridge
              const destPriceData = convertableCurrencyStates[convertableCurrencyId];
              const rootPriceData = convertableCurrencyStates[currencyid];

              const viapriceinroot = 1 / rootPriceData.lastconversionprice;
              const destpriceinvia = destPriceData.lastconversionprice;
              const price = viapriceinroot*destpriceinvia;

              paths[convertableCurrencyId].push({
                destination: convertableCurrencyDefinition,
                exportto: systemDefinition,
                via: bridgeCurrencyDefinition,
                price,
                viapriceinroot,
                destpriceinvia,
                gateway: true
              });

              // Or bounce back to ETH through any currency mapped to your destination
              for (const contractAddress of erc20sMappedToCurrency) {
                paths[contractAddress] = []

                try {
                  if (contractAddress !== ETH_CONTRACT_ADDRESS) {
                    const contract = getWeb3ProviderForNetwork(ethNetwork).getUnitializedContractInstance(contractAddress);
                    const name = await contract.name();
                    const symbol = await contract.symbol();
                    const decimals = await contract.decimals();

                    paths[contractAddress].push({
                      via: bridgeCurrencyDefinition,
                      destination: {
                        address: contractAddress,
                        symbol,
                        decimals,
                        name,
                        mapto: convertableCurrencyDefinition
                      },
                      price,
                      gateway: true,
                      bounceback: true,
                      ethdest: true
                    });
                  } else {
                    paths[ETH_CONTRACT_ADDRESS].push({
                      via: bridgeCurrencyDefinition,
                      destination: {
                        address: ETH_CONTRACT_ADDRESS,
                        symbol: "ETH",
                        decimals: 18,
                        name: "Ethereum",
                        mapto: convertableCurrencyDefinition
                      },
                      price,
                      gateway: true,
                      bounceback: true,
                      ethdest: true
                    });
                  }
                } catch(e) {
                  console.log("Error fetching information for contract " + contractAddress)
                  console.warn(e)
                }
              }
            }
          }
        }

        paths[currencyid] = [{
          destination: currencydefinition,
          exportto: systemDefinition,
          price: 1,
          gateway: true,
          mapping: true
        }];
      }
    }

    return paths;
  } else {
    let sourceDefinition, destDefinition;
  
    const sourceResponse = await endpoint.getCurrency(src);
  
    if (sourceResponse.error) throw new Error(sourceResponse.error.message);
  
    sourceDefinition = sourceResponse.result;
  
    // if (dest != null) {
    //   const destResponse = await endpoint.getCurrency(dest);
  
    //   if (destResponse.error) throw new Error(destResponse.error.message)
  
    //   destDefinition = destResponse.result
    // }
  
    const paths = await endpoint.getCurrencyConversionPaths(sourceDefinition, destDefinition);
  
    for (const destinationid in paths) {
      paths[destinationid] = paths[destinationid].filter(x => {
        const offSystem = (x.destination.systemid != systemId) || (x.via != null && x.via.systemid != systemId);
        
        return !(offSystem && x.exportto == null);
      });
    }

    const mappedCurrenciesResponse = await getCurrenciesMappedToEth(systemId, ethNetwork);
    if (mappedCurrenciesResponse.error) throw new Error(sourceResponse.error.message);
    const {currencyIdToContractAddressMap} = mappedCurrenciesResponse.result;

    if (currencyIdToContractAddressMap.has(sourceDefinition.currencyid)) {
      const mappedEthCurrencies = currencyIdToContractAddressMap.get(sourceDefinition.currencyid);

      for (const contractAddress of mappedEthCurrencies) {
        paths[contractAddress] = []

        const vEthCurrencyResponse = await endpoint.getCurrency(VETH);
        if (vEthCurrencyResponse.error) throw new Error(vEthCurrencyResponse.error.message);
        const vEthCurrencyDefinition = vEthCurrencyResponse.result;

        if (contractAddress === ETH_CONTRACT_ADDRESS) {
          paths[contractAddress].push({
            destination: {
              address: ETH_CONTRACT_ADDRESS,
              symbol: "ETH",
              decimals: 18,
              name: "Ethereum"
            },
            exportto: vEthCurrencyDefinition,
            price: 1,
            gateway: true,
            mapping: true
          })
        } else {
          const contract = getWeb3ProviderForNetwork(ethNetwork).getUnitializedContractInstance(contractAddress);
          const name = await contract.name();
          const symbol = await contract.symbol();
          const decimals = await contract.decimals();
  
          paths[contractAddress].push({
            destination: {
              address: contractAddress,
              symbol,
              decimals,
              name
            },
            exportto: vEthCurrencyDefinition,
            price: 1,
            gateway: true,
            mapping: true
          })
        }
      }
    }
  
    return paths;
  }
}