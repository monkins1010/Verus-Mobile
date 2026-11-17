jest.mock('../../../actions/actions/coins/Coins', () => ({
  ...jest.requireActual('../../../actions/actions/coins/Coins'),
  addCoin: jest.fn(),
}));

import {DLIGHT_PRIVATE, ELECTRUM} from '../../constants/intervalConstants';
import {addCoin} from '../../../actions/actionCreators';
import {CoinDirectory} from '../../CoinData/CoinDirectory';
import {TEST_PROFILE_OVERRIDES, USDC_ETH_MAINNET_COIN_ID, USDC_POLYGON_AMOY_COIN_ID} from '../../constants/constants';
import {addStartingCoins, buildProfileSeeds} from '../../profile/createProfileFromSeed';

describe('createProfileFromSeed helpers', () => {
  it('stores generated wallet seed in both primary and dlight channels when requested', () => {
    const seeds = buildProfileSeeds('seed words', true);

    expect(seeds[ELECTRUM]).toBe('seed words');
    expect(seeds[DLIGHT_PRIVATE]).toBe('seed words');
  });

  it('keeps dlight seed absent unless requested', () => {
    const seeds = buildProfileSeeds('seed words', false);

    expect(seeds[ELECTRUM]).toBe('seed words');
    expect(seeds[DLIGHT_PRIVATE]).toBeUndefined();
  });

  it.each([
    [{}, ['MATIC', 'i61cV2uicKSi1rSMQCBNQeSYC3UAi9GVzd', USDC_ETH_MAINNET_COIN_ID], 'homestead'],
    [TEST_PROFILE_OVERRIDES, ['MATIC_AMOY', 'iFMqivtShssEpViJbVtqVz53rsXvjqndQn', USDC_POLYGON_AMOY_COIN_ID], 'matic-amoy'],
  ])('adds the matching network and stablecoins for profile overrides %p', async (overrides, expected, network) => {
    const dispatch = jest.fn();
    const find = jest.spyOn(CoinDirectory, 'findCoinObj').mockImplementation(id => ({id}));
    const register = jest.spyOn(CoinDirectory, 'addErc20Token').mockResolvedValue();
    addCoin.mockResolvedValue({type: 'coin-added'});

    try {
      await addStartingCoins({accountId: 'profile', activeCoinList: [], dispatch, testnetOverrides: overrides});
      expect(register).toHaveBeenCalledWith(expect.objectContaining({symbol: 'USDC'}), network);
      expect(expected.every(id => find.mock.calls.some(([actual]) => actual === id))).toBe(true);
      expect(dispatch).toHaveBeenCalledTimes(find.mock.calls.length);
    } finally {
      find.mockRestore();
      register.mockRestore();
    }
  });
});
