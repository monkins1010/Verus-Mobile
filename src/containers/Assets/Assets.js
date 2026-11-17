/*
  New file: Assets
  - Renders a list of user assets with logo/name (left) and fiat value + crypto amount (right)
  - Sorted by fiat value descending; includes zero-balance assets
  - Tapping a row navigates to CoinMenus via existing openCoin flow
  - Header-right button opens ManageAssetsSheet (arrange option hidden)
  - 2026-01-23: Updated pricing and sorting logic - coins without fiat pricing now 
    display "Price unavailable" and are sorted by crypto balance instead of being 
    treated as zero-value assets.
*/
import React, { useMemo, useState, useLayoutEffect, useCallback } from 'react';
import { View } from 'react-native';
import { Portal, List } from 'react-native-paper';
import AssetsRender from './Assets.render';
import {useNavigation} from '@react-navigation/native';
import {useDispatch, useSelector} from 'react-redux';
import SemiModal from '../../components/SemiModal';
import { RenderSquareCoinLogo } from '../../utils/CoinData/Graphics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useObjectSelector } from '../../hooks/useObjectSelector';
import { extractDisplaySubWallets } from '../../utils/subwallet/extractSubWallets';
import { extractLedgerData } from '../../utils/ledger/extractLedgerData';
import { API_GET_BALANCES, GENERAL, WYRE_SERVICE } from '../../utils/constants/intervalConstants';
import { USD } from '../../utils/constants/currencies';
import { CoinDirectory } from '../../utils/CoinData/CoinDirectory';
import BigNumber from 'bignumber.js';
import { setActiveCoin, setActiveApp, setActiveSection, setCoinSubWallet } from '../../actions/actionCreators';
import Colors from '../../globals/colors';
import ManageAssetsSheet from '../Home/HomeFAB/ManageAssetsSheet';
import HomeFAB from '../Home/HomeFAB/HomeFAB';
import TransferSheet from '../Home/HomeFAB/TransferSheet';
import BuySellSheet from '../Services/ServiceComponents/ValuService/BuySellSheet/BuySellSheet';
import { VALU_SERVICE_ID } from '../../utils/constants/services';
import {
  openAddErc20TokenModal,
  openAddPbaasCurrencyModal,
} from '../../actions/actions/sendModal/dispatchers/sendModal';

const Assets = () => {
  const navigation = useNavigation();
  const dispatch = useDispatch();

  const activeCoinsForUser = useObjectSelector((state) => state.coins.activeCoinsForUser);
  const allSubWallets = useObjectSelector((state) => extractDisplaySubWallets(state));
  const balances = useObjectSelector((state) => extractLedgerData(state, 'balances', API_GET_BALANCES));
  const rates = useObjectSelector((state) => state.ledger.rates);
  const testnetOverrides = useObjectSelector(
    (state) => state.authentication.activeAccount?.testnetOverrides,
  );
  const displayCurrency = useSelector((state) => state.settings.generalWalletSettings.displayCurrency || USD);
  const showBalance = useSelector((state) => state.coins.showBalance);

  const [manageVisible, setManageVisible] = useState(false);
  const [buySellSheetVisible, setBuySellSheetVisible] = useState(false);
  const [transferSheetVisible, setTransferSheetVisible] = useState(false);
  const [networkPickerVisible, setNetworkPickerVisible] = useState(false);
  const [networkPickerCoins, setNetworkPickerCoins] = useState({ eth: null, matic: null });

  const insets = useSafeAreaInsets();

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

  const assets = useMemo(() => {
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

  const openCoin = (coinObj) => {
    const subWallets = allSubWallets[coinObj.id] || [];
    const subWallet = subWallets[0];
    if (subWallet != null) {
      dispatch(setCoinSubWallet(coinObj.id, subWallet));
    }
    dispatch(setActiveCoin(coinObj));
    dispatch(setActiveApp(coinObj.default_app));
    dispatch(setActiveSection(coinObj.apps[coinObj.default_app].data[0]));
    navigation.navigate('CoinMenus');
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

  const _handleTransferReceive = () => {
    setTransferSheetVisible(false);
    navigation.navigate('ReceiveAssetsList');
  };

  const _handleTransferSendConvert = () => {
    setTransferSheetVisible(false);
    navigation.navigate('SendWizard');
  };

  const _addPbaasCurrency = async () => {
    openAddPbaasCurrencyModal(
      CoinDirectory.findCoinObj(
        testnetOverrides?.VRSC ? testnetOverrides.VRSC : 'VRSC',
      ),
    );
  };

  const _addErc20Token = () => {
    const isTestnet = testnetOverrides && Object.keys(testnetOverrides).length > 0;
    const ethCoinId = testnetOverrides?.ETH ? testnetOverrides.ETH : 'ETH';
    const maticCoinId = isTestnet ? 'MATIC_AMOY' : 'MATIC';
    setNetworkPickerCoins({
      eth: CoinDirectory.findCoinObj(ethCoinId),
      matic: CoinDirectory.findCoinObj(maticCoinId),
    });
    setNetworkPickerVisible(true);
  };

  useLayoutEffect(() => {
    navigation.setOptions({
      headerBackTitleVisible: false,
      headerBackTitle: '',
    });
  }, [navigation]);

  return (
    <Portal.Host>
      <AssetsRender.List
        assets={assets}
        displayCurrency={displayCurrency}
        showBalance={showBalance}
        onPressAsset={(coinObj) => openCoin(coinObj)}
        onPressAddAssets={() => setManageVisible(true)}
      />
      {/* Shared HomeFAB for consistent bottom placement within this screen */}
      <HomeFAB
        handleOpenOnOffRamp={_openOnOffRamp}
        handleTransfer={() => setTransferSheetVisible(true)}
      />
      {buySellSheetVisible && (
        <BuySellSheet
          visible={true}
          onClose={() => setBuySellSheetVisible(false)}
          onComplete={_handleBuySellComplete}
        />
      )}
      {transferSheetVisible && (
        <TransferSheet
          visible={true}
          onClose={() => setTransferSheetVisible(false)}
          onSelectReceive={_handleTransferReceive}
          onSelectSendConvert={_handleTransferSendConvert}
        />
      )}
      <ManageAssetsSheet
        visible={manageVisible}
        onClose={() => setManageVisible(false)}
        showConfigureHomeCards={false}
        onBrowseAll={() => navigation.navigate('AddCoin')}
        onAddErc20={_addErc20Token}
        onAddPbaas={_addPbaasCurrency}
        onArrangeCards={() => {}}
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
    </Portal.Host>
  );
};

export default Assets;
