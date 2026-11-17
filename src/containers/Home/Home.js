/*
  Home (Wallet)
  - 2025-11-21: Renamed to Wallet. 
  - Merged Assets functionality.
  - Removed widgets (moved to Services).
  - 2025-11-22: Removed legacy drawer close call (bottom tabs own settings).
  - 2025-12-11: Updated openCoin to navigate within wallet stack to preserve tab bar.
  - 2026-01-09: Removed the in-wallet Crypto/Identities category toggle; Wallet now
    always shows Crypto assets (Identity lives in its own bottom tab).
  - 2026-01-23: Updated pricing and sorting logic - coins without fiat pricing now 
    display "Price unavailable" and are sorted by crypto balance instead of being 
    treated as zero-value assets.
*/

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {AppState, View} from 'react-native';
import {Portal, List} from 'react-native-paper';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import SemiModal from '../../components/SemiModal';
import {RenderSquareCoinLogo} from '../../utils/CoinData/Graphics';
import {
  setActiveCoin,
  setActiveApp,
  setActiveSection,
  expireCoinData,
  setCoinSubWallet,
  expireServiceData,
  saveGeneralSettings,
} from '../../actions/actionCreators';
import { CommonActions, useNavigation, useFocusEffect } from '@react-navigation/native';
import {
  API_GET_FIATPRICE,
  API_GET_BALANCES,
  API_GET_INFO,
  GENERAL,
  WYRE_SERVICE,
  API_GET_SERVICE_ACCOUNT,
  API_GET_SERVICE_PAYMENT_METHODS,
  API_GET_SERVICE_RATES,
  API_GET_SERVICE_NOTIFICATIONS,
} from '../../utils/constants/intervalConstants';
import { USD } from '../../utils/constants/currencies';
import {
  conditionallyUpdateService,
  conditionallyUpdateWallets,
  dispatchAddWidget,
} from '../../actions/actionDispatchers';
import BigNumber from 'bignumber.js';
import {
  extractLedgerData,
} from '../../utils/ledger/extractLedgerData';
import { requestAttestationData } from '../../utils/auth/authBox';
import { ATTESTATIONS_PROVISIONED } from '../../utils/constants/attestations';
import { HomeRender } from './Home.render';
import { extractDisplaySubWallets } from '../../utils/subwallet/extractSubWallets';
import { createAlert } from '../../actions/actions/alert/dispatchers/alert';
import { VALU_SERVICE_ID } from '../../utils/constants/services';
import { CoinDirectory } from '../../utils/CoinData/CoinDirectory';
import {
  openAddErc20TokenModal,
  openAddPbaasCurrencyModal,
} from '../../actions/actions/sendModal/dispatchers/sendModal';
import { useSelector, useDispatch } from 'react-redux';
import store from '../../store';
import { useObjectSelector } from '../../hooks/useObjectSelector';
import {refreshRegistrationJobs} from '../../actions/actions/services/dispatchers/verusid/registration';
import { useUsdcBridgeWatcher } from '../../hooks/useUsdcBridgeWatcher';
import {
  USDC_ETH_MAINNET_COIN_ID,
  USDC_POLYGON_AMOY_COIN_ID,
  VUSDC_VETH_MAINNET_COIN_ID,
} from '../../utils/constants/constants';

const USDC_BRIDGEABLE_MAINNET = new Set([USDC_ETH_MAINNET_COIN_ID]);
const USDC_BRIDGEABLE_TESTNET = new Set([USDC_POLYGON_AMOY_COIN_ID]);
// Verus-side vUSDC coins that can be offramped to EVM (Part A)
const VERUS_USDC_OFFRAMPABLE_MAINNET = new Set([VUSDC_VETH_MAINNET_COIN_ID]);

const Home = () => {
  const dispatch = useDispatch();
  const navigation = useNavigation();

  const activeCoinsForUser = useObjectSelector((state) => state.coins.activeCoinsForUser);

  const activeAccount = useObjectSelector((state) => state.authentication.activeAccount);
  const testnetOverrides = useObjectSelector(
    (state) => state.authentication.activeAccount?.testnetOverrides || {},
  );
  const balances = useObjectSelector((state) =>
    extractLedgerData(state, 'balances', API_GET_BALANCES),
  );
  const rates = useObjectSelector((state) => state.ledger.rates);
  const attestation = useSelector((state) => state.attestation);
  const allSubWallets = useObjectSelector((state) => extractDisplaySubWallets(state));
  const activeSubWallets = useObjectSelector((state) => state.coinMenus.activeSubWallets);
  
  const displayCurrency = useSelector(
    (state) => state.settings.generalWalletSettings.displayCurrency || USD,
  );
  const showBalance = useSelector((state) => state.coins.showBalance);

  const [loading, setLoading] = useState(false);
  const [displayCurrencyModalOpen, setDisplayCurrencyModalOpen] = useState(false);
  const [buySellSheetVisible, setBuySellSheetVisible] = useState(false);
  const [transferSheetVisible, setTransferSheetVisible] = useState(false);
  const [manageVisible, setManageVisible] = useState(false);
  const [hasValuProofOfPersonhood, setHasValuProofOfPersonhood] = useState(false);
  const [networkPickerVisible, setNetworkPickerVisible] = useState(false);
  const [networkPickerCoins, setNetworkPickerCoins] = useState({ eth: null, matic: null });

  const insets = useSafeAreaInsets();
  useUsdcBridgeWatcher();

  const isTestnetProfile = testnetOverrides && Object.keys(testnetOverrides).length > 0;
  const bridgeableCoinIds = isTestnetProfile
    ? USDC_BRIDGEABLE_TESTNET
    : USDC_BRIDGEABLE_MAINNET;
  // EVM USDC coins that can be cashed out to fiat (Part B) — same set
  const cashoutCoinIds = bridgeableCoinIds;
  // Verus vUSDC coins that can be bridged back to EVM (Part A).
  // Uses multiple signals because the testnet PBaaS ticker ("vUSDC") differs
  // from the mainnet one ("vUSDC.vETH"), and mapped_to is the most reliable.
  const offrampableVerusCoinIds = useMemo(
    () => new Set(
      activeCoinsForUser
        .filter(c => {
          if (c.proto !== 'vrsc') return false;
          const ticker = (c.display_ticker ?? '').toUpperCase();
          return (
            ticker.includes('VUSDC') ||
            ticker.includes('VUSDC') ||
            c.mapped_to === 'USDC' ||
            c.mapped_to === USDC_POLYGON_AMOY_COIN_ID ||
            c.mapped_to === USDC_ETH_MAINNET_COIN_ID
          );
        })
        .map(c => c.id),
    ),
    [activeCoinsForUser],
  );

  useEffect(() => {
    // Check for specific "Valu Proof of Personhood" attestation
    const checkForValuProofOfPersonhood = async () => {
      if (attestation && attestation.attestations_provisioned) {
        try {
          const attestationData = await requestAttestationData(ATTESTATIONS_PROVISIONED);
          if (attestationData) {
            // Check if any attestation has the name "Valu Proof of Personhood"
            const hasValuAttestation = Object.values(attestationData).some(attestationItem => 
              attestationItem && 
              typeof attestationItem === 'object' && 
              attestationItem.name === "Valu Proof of Personhood"
            );
            setHasValuProofOfPersonhood(hasValuAttestation);
          } else {
            setHasValuProofOfPersonhood(false);
          }
        } catch (e) {
          console.warn('Could not check attestations:', e.message);
          setHasValuProofOfPersonhood(false);
        }
      } else {
        setHasValuProofOfPersonhood(false);
      }
    };

    checkForValuProofOfPersonhood();
  }, [attestation]);

  const setDisplayCurrencyFunc = async (currency) => {
    try {
      dispatch(await saveGeneralSettings({ displayCurrency: currency }));
    } catch (e) {
      createAlert('Error setting display currency', e.message);
    }
  };

  useFocusEffect(
    useCallback(() => {
      refresh(false);
      const resumeRegistrations = () => {
        if (!store.getState().authentication.activeAccount) return;
        // A suspended app may miss polling intervals. Reconcile protected jobs
        // when Home is shown again; failed lookups retain their durable state.
        refreshRegistrationJobs().catch(() => {});
      };
      resumeRegistrations();
      const subscription = AppState.addEventListener('change', state => {
        if (state === 'active') resumeRegistrations();
      });
      return () => subscription.remove();
    }, []),
  );

  const refresh = useCallback(
    async (showLoading = false) => {
      // Only pull-to-refresh controls the spinner. Background refreshes must
      // neither reveal it nor dismiss a manual refresh that is still running.
      if (showLoading) setLoading(true);

      const serviceUpdates = [
        API_GET_SERVICE_ACCOUNT,
        API_GET_SERVICE_PAYMENT_METHODS,
        API_GET_SERVICE_RATES,
        API_GET_SERVICE_NOTIFICATIONS,
      ];

      const coinUpdates = [API_GET_FIATPRICE, API_GET_BALANCES, API_GET_INFO];

      // Plan the whole wallet refresh together so address requests can share a
      // batch. Service work runs alongside it without delaying wallet requests.
      const walletRefresh = conditionallyUpdateWallets(
        store.getState(),
        dispatch,
        coinUpdates.flatMap(updateId =>
          activeCoinsForUser.map(coin => ({chainTicker: coin.id, updateId})),
        ),
      ).catch(e => {
        console.warn('Error forcing wallet updates');
        console.warn(e);
      });

      for (const updateId of serviceUpdates) {
        try {
          await conditionallyUpdateService(store.getState(), dispatch, updateId);
        } catch (e) {
          console.warn('Error forcing update to ' + updateId);
          console.warn(e);
        }
      }

      await walletRefresh;
      if (showLoading) setLoading(false);
    },
    [activeCoinsForUser, dispatch],
  );

  const resetToScreen = (route, title, data) => {
    const resetAction = CommonActions.reset({
      index: 1,
      routes: [
        { name: 'Home' },
        { name: route, params: { title: title, data: data } },
      ],
    });

    navigation?.closeDrawer?.();
    navigation.dispatch(resetAction);
  };

  const forceUpdate = () => {
    activeCoinsForUser.forEach((coinObj) => {
      dispatch(expireCoinData(coinObj.id, API_GET_FIATPRICE));
      dispatch(expireCoinData(coinObj.id, API_GET_BALANCES));
      dispatch(expireCoinData(coinObj.id, API_GET_INFO));
    });

    dispatch(expireServiceData(API_GET_SERVICE_ACCOUNT));
    dispatch(expireServiceData(API_GET_SERVICE_PAYMENT_METHODS));
    dispatch(expireServiceData(API_GET_SERVICE_RATES));
    dispatch(expireServiceData(API_GET_SERVICE_NOTIFICATIONS));

    refresh(true);
  };

  const getRate = useCallback((coinId, currency) => {
    return rates[WYRE_SERVICE] &&
      rates[WYRE_SERVICE][coinId] &&
      rates[WYRE_SERVICE][coinId][currency]
      ? rates[WYRE_SERVICE][coinId][currency]
      : rates[GENERAL] &&
        rates[GENERAL][coinId] &&
        rates[GENERAL][coinId][currency]
      ? rates[GENERAL][coinId][currency]
      : null;
  }, [rates]);

  const cryptoAssets = useMemo(() => {
    return activeCoinsForUser.map((coinObj) => {
      const subWallets = allSubWallets[coinObj.id] || [];
      let crypto = BigNumber(0);
      subWallets.forEach((wallet) => {
        if (balances[coinObj.id] && balances[coinObj.id][wallet.id] && balances[coinObj.id][wallet.id].total != null) {
          crypto = crypto.plus(BigNumber(balances[coinObj.id][wallet.id].total));
        }
      });
      const rate = getRate(coinObj.id, displayCurrency);
      const fiat = rate != null ? Number(BigNumber(crypto).multipliedBy(rate)) : null;
      return { coinObj, crypto: crypto.toNumber(), fiat, rate };
    }).sort((a, b) => {
      const aHasBalance = a.crypto > 0;
      const bHasBalance = b.crypto > 0;
      
      // First priority: coins with balance come before coins without balance
      if (aHasBalance && !bHasBalance) return -1;
      if (!aHasBalance && bHasBalance) return 1;
      
      // Both have balance OR both don't have balance
      if (aHasBalance && bHasBalance) {
        // Both have balance: prioritize by fiat if available, otherwise by crypto
        if (a.fiat != null && b.fiat != null) return b.fiat - a.fiat;
        if (a.fiat != null) return -1;
        if (b.fiat != null) return 1;
        return b.crypto - a.crypto;
      }
      
      // Both have zero balance: sort by fiat if available
      if (a.fiat != null && b.fiat != null) return b.fiat - a.fiat;
      if (a.fiat != null) return -1;
      if (b.fiat != null) return 1;
      return 0;
    });
  }, [activeCoinsForUser, allSubWallets, balances, displayCurrency, getRate]);

  const _verusPay = () => {
    navigation.navigate('VerusPay');
  };

  const openCoin = (coinObj) => {
    const subWallets = allSubWallets[coinObj.id];
    const subWallet = activeSubWallets[coinObj.id] ? activeSubWallets[coinObj.id] : subWallets[0];
    
    if (subWallet != null) {
      dispatch(setCoinSubWallet(coinObj.id, subWallet));
    }
    dispatch(setActiveCoin(coinObj));
    dispatch(setActiveApp(coinObj.default_app));
    dispatch(setActiveSection(coinObj.apps[coinObj.default_app].data[0]));

    // Navigate to CoinMenus within the wallet stack to preserve tab bar visibility
    navigation.navigate('CoinMenus');
  };

  const _addCoin = () => {
    navigation.navigate('AddCoin', { refresh: refresh });
  };

  const _addPbaasCurrency = async () => {
    openAddPbaasCurrencyModal(
      CoinDirectory.findCoinObj(testnetOverrides.VRSC ? testnetOverrides.VRSC : 'VRSC'),
    );
  };

  const _addErc20Token = () => {
    const isTestnet = testnetOverrides && Object.keys(testnetOverrides).length > 0;
    const ethCoinId = testnetOverrides.ETH ? testnetOverrides.ETH : 'ETH';
    const maticCoinId = isTestnet ? 'MATIC_AMOY' : 'MATIC';
    setNetworkPickerCoins({
      eth: CoinDirectory.findCoinObj(ethCoinId),
      matic: CoinDirectory.findCoinObj(maticCoinId),
    });
    setNetworkPickerVisible(true);
  };

  const _openOnOffRamp = () => {
    setBuySellSheetVisible(true);
  };

  const _handleBuySellComplete = ({ action, address }) => {
    setBuySellSheetVisible(false);
    navigation.navigate('Service', {
      service: VALU_SERVICE_ID,
      subScreen: action === 'sell' ? 'offRamp' : 'onRamp',
      subScreenData: { initialAddress: address }
    });
  };

  const _openTransferSheet = () => {
    setTransferSheetVisible(true);
  };

  const _handleTransferReceive = () => {
    setTransferSheetVisible(false);
    navigation.navigate('ReceiveAssetsList');
  };

  const _handleTransferSendConvert = () => {
    setTransferSheetVisible(false);
    navigation.navigate('SendWizard');
  };

  const _openUsdcBridge = (coinObj, cryptoBalance) => {
    navigation.navigate('UsdcBridgeScreen', {
      usdcCoinId: coinObj.id,
      cryptoBalance,
    });
  };

  const _openCashout = (coinObj, cryptoBalance) => {
    navigation.navigate('EvmToFiatScreen', {
      usdcCoinId: coinObj.id,
      cryptoBalance,
    });
  };

  const _openVerusToEvm = (vUsdcCoinObj, cryptoBalance) => {
    const evmCoinId = isTestnetProfile
      ? USDC_POLYGON_AMOY_COIN_ID
      : USDC_ETH_MAINNET_COIN_ID;
    navigation.navigate('VerusToEvmScreen', {
      vUsdcCoinId: vUsdcCoinObj.id,
      evmCoinId,
      cryptoBalance,
    });
  };

  return (
    <>
      <HomeRender
        displayCurrencyModalOpen={displayCurrencyModalOpen}
        displayCurrency={displayCurrency}
        setDisplayCurrency={setDisplayCurrencyFunc}
        setDisplayCurrencyModalOpen={setDisplayCurrencyModalOpen}
        _addCoin={_addCoin}
        _verusPay={_verusPay}
        _addPbaasCurrency={_addPbaasCurrency}
        _addErc20Token={_addErc20Token}
        handleOpenOnOffRamp={_openOnOffRamp}
        buySellSheetVisible={buySellSheetVisible}
        setBuySellSheetVisible={setBuySellSheetVisible}
        handleBuySellComplete={_handleBuySellComplete}
        handleTransferPress={_openTransferSheet}
        transferSheetVisible={transferSheetVisible}
        setTransferSheetVisible={setTransferSheetVisible}
        handleTransferReceive={_handleTransferReceive}
        handleTransferSendConvert={_handleTransferSendConvert}
        forceUpdate={forceUpdate}
        loading={loading}
        assets={cryptoAssets}
        bridgeableCoinIds={bridgeableCoinIds}
        onBridgePress={_openUsdcBridge}
        cashoutCoinIds={cashoutCoinIds}
        onCashoutPress={_openCashout}
        offrampableVerusCoinIds={offrampableVerusCoinIds}
        onOfframpPress={_openVerusToEvm}
        showBalance={showBalance}
        openCoin={openCoin}
        manageVisible={manageVisible}
        setManageVisible={setManageVisible}
        hasValuProofOfPersonhood={hasValuProofOfPersonhood}
      />
      {networkPickerVisible && networkPickerCoins.eth && networkPickerCoins.matic && (
        <Portal>
          <SemiModal
            animationType="slide"
            transparent={true}
            visible={true}
            onRequestClose={() => setNetworkPickerVisible(false)}
            title="Select network"
            flexHeight={0.01}
            contentContainerStyle={{
              borderTopLeftRadius: 16,
              borderTopRightRadius: 16,
              flex: 0,
              alignSelf: 'flex-end',
              width: '100%',
              paddingBottom: 12 + insets.bottom,
            }}
          >
            <View style={{ paddingHorizontal: 12 }}>
              <List.Item
                title={networkPickerCoins.eth.display_name}
                description="Add a token by contract address on Ethereum"
                onPress={() => {
                  setNetworkPickerVisible(false);
                  setTimeout(() => openAddErc20TokenModal(networkPickerCoins.eth), 0);
                }}
                left={() => (
                  <View style={{ width: 40, alignItems: 'center', justifyContent: 'center' }}>
                    {RenderSquareCoinLogo(networkPickerCoins.eth.id, {}, 32, 32, { disableBadge: true })}
                  </View>
                )}
                right={(props) => <List.Icon {...props} icon="chevron-right" />}
                titleStyle={{ fontSize: 18, fontWeight: '600', color: 'black' }}
                descriptionStyle={{ fontSize: 14, color: '#666', marginTop: 4 }}
                style={{ backgroundColor: 'white', borderRadius: 12, marginBottom: 12, paddingVertical: 8 }}
              />
              <List.Item
                title={networkPickerCoins.matic.display_name}
                description="Add a token by contract address on Polygon"
                onPress={() => {
                  setNetworkPickerVisible(false);
                  setTimeout(() => openAddErc20TokenModal(networkPickerCoins.matic), 0);
                }}
                left={() => (
                  <View style={{ width: 40, alignItems: 'center', justifyContent: 'center' }}>
                    {RenderSquareCoinLogo(networkPickerCoins.matic.id, {}, 32, 32, { disableBadge: true })}
                  </View>
                )}
                right={(props) => <List.Icon {...props} icon="chevron-right" />}
                titleStyle={{ fontSize: 18, fontWeight: '600', color: 'black' }}
                descriptionStyle={{ fontSize: 14, color: '#666', marginTop: 4 }}
                style={{ backgroundColor: 'white', borderRadius: 12, paddingVertical: 8 }}
              />
            </View>
          </SemiModal>
        </Portal>
      )}
    </>
  );
};

export default Home;
