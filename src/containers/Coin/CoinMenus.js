/*
  CoinMenus - Asset Overview Screen
  - 2024-12-15: 
    * Changed header icon from format-list-bulleted to tune-vertical for consistency.
  - 2025-12-15: 
    * Total balance display integrated into ticker row under coin name.
    * Send/Receive buttons moved to fixed FAB at bottom (like HomeFAB).
  - 2026-01-12:
    * Updated Receive + Send/convert buttons to match Wallet screen "Transfer" button styling (contained, light-blue background).
    * Made "Send / convert" label the same size as "Receive" (removed compact label override).
  - 2026-01-10:
    * Option A header redesign: unify title/total + selected balance + address selector into a cleaner header block.
    * Moved Ethereum contract affordance from inline pill to a header-right Ethereum icon (ERC20 only) opening existing explorer sheet.
    * Made Receive + Send/convert actions equal-weight (both secondary).
  - 2026-01-10:
    * Enhanced Etherscan sheet to include contract name/address context and a short explanation of the Ethereum linkage.
  - 2025-12-11: Major redesign - removed custom bottom tab bar in favor of 
    preserving the main app tab bar. Send/Receive buttons now in wallet cards.
    Uses clean header with coin icon, name, ticker, mapped pill, and list cards icon.
    Includes Etherscan explorer sheet for mapped currencies.
  - Previous: Displayed BottomNavigation tabs (Overview/Send/Receive).
*/

import React, { useState, useEffect, useLayoutEffect, useMemo, useCallback, useRef } from "react";
import {
  View,
  StyleSheet,
  TouchableOpacity,
} from "react-native";
import { useDispatch, useSelector } from 'react-redux';
import { useIsFocused, useNavigation, useRoute } from '@react-navigation/native';
import { Portal, Text, Button } from "react-native-paper";
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Stop, Rect } from 'react-native-svg';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import BigNumber from 'bignumber.js';
import Overview from './Overview/Overview';
import DynamicHeader from "./DynamicHeader";
import { setCoinSubWallet, setIsCoinMenuFocused } from "../../actions/actionCreators";
import SubWalletSelectorModal from "../SubWalletSelect/SubWalletSelectorModal";
import { subWalletActivity } from "../../utils/subwallet/subWalletStatus";
import MissingInfoRedirect from "../../components/MissingInfoRedirect/MissingInfoRedirect";
import { WALLET_APP_OVERVIEW } from "../../utils/constants/apps";
import Colors from "../../globals/colors";
import { RenderSquareCoinLogo } from "../../utils/CoinData/Graphics";
import { CoinDirectory } from "../../utils/CoinData/CoinDirectory";
import { coinsList } from "../../utils/CoinData/CoinsList";
import {
  VERUS_BRIDGE_DELEGATOR_GOERLI_CONTRACT,
  VERUS_BRIDGE_DELEGATOR_MAINNET_CONTRACT,
} from "../../utils/constants/web3Constants";
import { openUrl } from "../../utils/linking";
import SemiModal from "../../components/SemiModal";
import GradientButton from "../../components/GradientButton";
import { useObjectSelector } from "../../hooks/useObjectSelector";
import { extractLedgerData } from "../../utils/ledger/extractLedgerData";
import { API_GET_BALANCES } from "../../utils/constants/intervalConstants";
import { truncateDecimal } from "../../utils/math";
import { createAlert } from "../../actions/actions/alert/dispatchers/alert";

const GRADIENT_HEIGHT = 48;
const FAB_ACTION_BUTTON_COLOR = '#EBF6FF';

const CoinMenus = () => {
  const dispatch = useDispatch();
  const navigation = useNavigation();
  const route = useRoute();
  const isFocused = useIsFocused();
  const insets = useSafeAreaInsets();
  const bottomPadding = Math.max(insets.bottom, 20);

  // Redux state
  const activeCoin = useObjectSelector((state) => state.coins.activeCoin);
  const activeAccount = useObjectSelector((state) => state.authentication.activeAccount);
  const selectedSubWallet = useObjectSelector(
    (state) => state.coinMenus.activeSubWallets[state.coins.activeCoin?.id]
  );
  const allSubWallets = useObjectSelector(
    (state) => state.coinMenus.allSubWallets[state.coins.activeCoin?.id]
  );
  const services = useSelector((state) => state.services);
  const showBalance = useSelector((state) => state.coins.showBalance);
  const balances = useObjectSelector((state) =>
    activeCoin ? extractLedgerData(state, 'balances', API_GET_BALANCES, activeCoin.id) : {},
  );

  // Local state
  const [filterForTab, setFilterForTab] = useState(null);
  const [explorerSheetVisible, setExplorerSheetVisible] = useState(false);
  const initializedSelection = useRef(null);
  const subWallets = allSubWallets || [];
  const matchingWallets = filterForTab == null
    ? subWallets
    : subWallets.filter((wallet) => wallet.compatible_apps.includes(filterForTab));
  const selectableWallets = matchingWallets.length > 0 ? matchingWallets : subWallets;
  const showWalletSelector = isFocused && activeAccount != null &&
    selectedSubWallet == null && selectableWallets.length > 0;

  // Calculate total balance across all wallets
  const totalConfirmedBalance = useMemo(() => {
    if (!balances || Object.keys(balances).length === 0) return BigNumber(0);
    return Object.values(balances).reduce((acc, bal) => {
      if (bal == null) return acc;
      const confirmed = BigNumber(bal.confirmed || 0);
      return acc.plus(confirmed);
    }, BigNumber(0));
  }, [balances]);

  // Passthrough data from navigation params
  const passthrough = route.params?.data || null;

  // Check if there are multiple cards
  const hasMultipleCards = (allSubWallets?.length || 0) > 1;

  // Get mapped coin object (e.g., USDC on Ethereum for vUSDC.vETH)
  const mappedCoinObj = useMemo(() => {
    if (!activeCoin || activeCoin.mapped_to == null || activeCoin.id === coinsList.VRSC?.id) {
      return null;
    }
    try {
      return CoinDirectory.getBasicCoinObj(activeCoin.mapped_to);
    } catch (e) {
      console.warn('Failed to get mapped coin:', e);
      return null;
    }
  }, [activeCoin]);

  // Check if mapped to Ethereum itself (not an ERC20 token)
  const mappedToEth = useMemo(() => {
    if (!activeCoin || activeCoin.mapped_to == null || !mappedCoinObj) return false;
    const currencyId = mappedCoinObj.currency_id?.toLowerCase();
    return (
      currencyId === VERUS_BRIDGE_DELEGATOR_GOERLI_CONTRACT?.toLowerCase() ||
      currencyId === VERUS_BRIDGE_DELEGATOR_MAINNET_CONTRACT?.toLowerCase()
    );
  }, [activeCoin, mappedCoinObj]);

  // Format the mapped currency display text
  const mappedDisplayText = useMemo(() => {
    if (!mappedCoinObj) return null;
    if (mappedToEth) return 'Ethereum';
    
    const ticker = mappedCoinObj.display_ticker;
    const truncatedTicker = ticker.length > 12 ? ticker.substring(0, 12) + '…' : ticker;
    
    if (mappedCoinObj.proto === 'erc20') {
      const addr = mappedCoinObj.currency_id;
      const shortAddr = addr ? `${addr.substring(0, 6)}…${addr.substring(addr.length - 4)}` : '';
      return `${truncatedTicker} (${shortAddr})`;
    }
    return truncatedTicker;
  }, [mappedCoinObj, mappedToEth]);

  const getExplorerUrl = useCallback(() => {
    if (!mappedCoinObj || mappedCoinObj.proto !== 'erc20') return '';
    
    const baseUrl = mappedCoinObj.testnet
      ? 'https://goerli.etherscan.io/token/'
      : 'https://etherscan.io/token/';
    return baseUrl + mappedCoinObj.currency_id;
  }, [mappedCoinObj]);

  const openTokenAddressExplorer = useCallback(() => {
    if (!mappedCoinObj || mappedCoinObj.proto !== 'erc20') return;
    setExplorerSheetVisible(true);
  }, [mappedCoinObj]);

  const handleListCardsPress = useCallback(() => {
    dispatch(setCoinSubWallet(activeCoin.id, null));
  }, [dispatch, activeCoin]);

  // Set up navigation header
  useLayoutEffect(() => {
    const showErc20Explorer = mappedCoinObj?.proto === 'erc20';

    navigation.setOptions({
      title: '',
      headerRight: (hasMultipleCards || showErc20Explorer)
        ? () => (
            <View style={styles.headerRightContainer}>
              {showErc20Explorer && (
                <TouchableOpacity
                  onPress={openTokenAddressExplorer}
                  style={styles.headerRightButton}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel="View token contract on Etherscan"
                >
                  <MaterialCommunityIcons
                    name="ethereum"
                    size={22}
                    color={Colors.verusDarkGray}
                  />
                </TouchableOpacity>
              )}
              {hasMultipleCards && (
                <TouchableOpacity
                  onPress={handleListCardsPress}
                  style={styles.headerRightButton}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel="Select address"
                >
                  <MaterialCommunityIcons 
                    name="tune-vertical" 
                    size={24} 
                    color={Colors.verusDarkGray} 
                  />
                </TouchableOpacity>
              )}
            </View>
          )
        : null,
      headerBackTitle: 'Back',
      headerShadowVisible: false,
      headerStyle: {
        backgroundColor: 'white',
        elevation: 0,
        shadowOpacity: 0,
      },
    });
  }, [navigation, hasMultipleCards, handleListCardsPress, mappedCoinObj, openTokenAddressExplorer]);

  // Set coin menu focused state
  useEffect(() => {
    dispatch(setIsCoinMenuFocused(true));
    return () => {
      dispatch(setIsCoinMenuFocused(false));
    };
  }, [dispatch]);

  // Auto-select subwallet if only one available
  useEffect(() => {
    if (activeAccount == null) {
      initializedSelection.current = null;
      return;
    }
    if (!activeCoin || !allSubWallets?.length) return;
    const selectionKey = `${activeAccount.accountHash}:${activeCoin.id}`;
    if (initializedSelection.current !== selectionKey) {
      initializedSelection.current = selectionKey;
      if (allSubWallets.length === 1 && selectedSubWallet == null) {
        dispatch(setCoinSubWallet(activeCoin.id, allSubWallets[0]));
      }
    }
  }, [activeAccount, allSubWallets, activeCoin, selectedSubWallet, dispatch]);

  // Reset filtered subwallets when subwallet is selected
  useEffect(() => {
    if (filterForTab != null && selectedSubWallet != null) {
      setFilterForTab(null);
    }
  }, [selectedSubWallet, filterForTab]);

  const goBack = useCallback(() => {
    navigation.goBack();
  }, [navigation]);

  const goToServices = useCallback(() => {
    navigation.navigate("Home", {
      screen: "ServicesHome",
      initial: false,
    });
  }, [navigation]);

  const handleSendPress = useCallback(() => {
    navigation.navigate('SendWizard', {
      initialCoinId: activeCoin.id,
      initialSubWalletId: selectedSubWallet?.id,
    });
  }, [navigation, activeCoin, selectedSubWallet]);

  const handleReceivePress = useCallback(() => {
    navigation.navigate('ReceiveAssetDetails', {
      coinId: activeCoin.id,
      subWalletId: selectedSubWallet?.id,
    });
  }, [navigation, activeCoin, selectedSubWallet]);

  const findCompatibleSubwallet = useCallback((tabKey) => {
    const subwalletsForTab = (allSubWallets || []).filter((wallet) =>
      wallet.compatible_apps.includes(tabKey)
    );

    if (subwalletsForTab.length > 0) {
      setFilterForTab(tabKey);
      dispatch(setCoinSubWallet(activeCoin.id, null));
    } else {
      createAlert("Error", "No compatible cards found.");
    }
  }, [allSubWallets, activeCoin, dispatch]);

  const renderHeader = () => (
    <View style={styles.headerContainer}>
      <View style={styles.titleRow}>
        {RenderSquareCoinLogo(activeCoin.id, {}, 28, 28)}
        <Text style={styles.headerTitle}>
          {activeCoin.display_name}
        </Text>
      </View>
      <View style={styles.tickerRow}>
        {/* Show total if multiple wallets, otherwise just ticker */}
        {hasMultipleCards && showBalance ? (
          <Text style={styles.headerTicker}>
            Total (all addresses): {truncateDecimal(totalConfirmedBalance, 4)} {activeCoin.display_ticker}
          </Text>
        ) : (
          <Text style={styles.headerTicker}>
            {activeCoin.display_ticker}
          </Text>
        )}
      </View>
    </View>
  );

  const renderOverviewContent = () => {
    if (!selectedSubWallet) return null;
    
    const { placeholder, active } = subWalletActivity(selectedSubWallet.id);

    if (!selectedSubWallet.compatible_apps.includes(WALLET_APP_OVERVIEW)) {
      return (
        <MissingInfoRedirect
          icon={"power-plug-off"}
          label={`This view isn't accessible from the ${selectedSubWallet.name} card.`}
          buttonLabel="Switch cards"
          onPress={() => findCompatibleSubwallet(WALLET_APP_OVERVIEW)}
        />
      );
    }

    if (!active(services)) {
      return (
        <MissingInfoRedirect
          icon={placeholder.icon}
          label={placeholder.label}
          buttonLabel="configure services"
          onPress={goToServices}
        />
      );
    }

    return (
      <Overview 
        navigation={navigation} 
        data={passthrough} 
        jumpTo={() => {}} 
      />
    );
  };

  if (!activeCoin) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Text>Asset not found.</Text>
      </View>
    );
  }

  return (
    <Portal.Host>
      <View style={styles.container}>
        {showWalletSelector && (
          <SubWalletSelectorModal
            visible={showWalletSelector}
            cancel={goBack}
            animationType="slide"
            subWallets={selectableWallets}
            chainTicker={activeCoin.id}
            displayTicker={activeCoin.display_ticker}
          />
        )}
        {selectedSubWallet != null && (
          <>
            <View style={styles.headerBlock}>
              <View style={styles.contentContainer}>
                {renderHeader()}
              </View>
              <DynamicHeader onReceivePress={handleReceivePress} />
            </View>
            {renderOverviewContent()}

            {/* Fixed FAB at bottom - like HomeFAB */}
            <Portal>
              <View
                pointerEvents="box-none"
                style={styles.fabContainer}
              >
                {/* Gradient Fade */}
                <Svg height={GRADIENT_HEIGHT} width="100%" style={{ marginBottom: -1 }}>
                  <Defs>
                    <LinearGradient id="coinFabGrad" x1="0" y1="0" x2="0" y2="1">
                      <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0" />
                      <Stop offset="0.3" stopColor="#FFFFFF" stopOpacity="0.1" />
                      <Stop offset="1" stopColor="#FFFFFF" stopOpacity="1" />
                    </LinearGradient>
                  </Defs>
                  <Rect x="0" y="0" width="100%" height={GRADIENT_HEIGHT} fill="url(#coinFabGrad)" />
                </Svg>

                {/* Button Row */}
                <View style={[styles.fabButtonRow, { paddingBottom: bottomPadding }]}>
                  <Button
                    mode="contained"
                    onPress={handleReceivePress}
                    style={styles.fabActionButton}
                    buttonColor={FAB_ACTION_BUTTON_COLOR}
                    textColor={Colors.primaryColor}
                    contentStyle={styles.fabActionContent}
                    uppercase={false}
                    labelStyle={styles.fabActionLabel}
                  >
                    Receive
                  </Button>

                  <Button
                    mode="contained"
                    onPress={handleSendPress}
                    style={styles.fabActionButton}
                    buttonColor={FAB_ACTION_BUTTON_COLOR}
                    textColor={Colors.primaryColor}
                    contentStyle={styles.fabActionContent}
                    uppercase={false}
                    labelStyle={styles.fabActionLabel}
                  >
                    Send / convert
                  </Button>
                </View>
              </View>
            </Portal>
          </>
        )}

        {/* Etherscan Explorer Sheet */}
        {explorerSheetVisible && mappedCoinObj && (
          <Portal>
            <SemiModal
              animationType="slide"
              transparent={true}
              visible={true}
              onRequestClose={() => setExplorerSheetVisible(false)}
              title="View on Etherscan"
              flexHeight={0.01}
              contentContainerStyle={{
                borderTopLeftRadius: 16,
                borderTopRightRadius: 16,
                flex: 0,
                alignSelf: 'flex-end',
                width: '100%',
              }}
            >
              <View>
                <View style={styles.sheetBody}>
                  <Text style={styles.infoParagraph}>
                    {'This asset is linked to an Ethereum token contract:'}
                  </Text>
                  <View style={styles.urlBox}>
                    <Text style={styles.urlText}>
                      {mappedCoinObj.display_ticker || mappedCoinObj.display_name || 'Token'}
                    </Text>
                    <Text style={[styles.urlText, { marginTop: 10 }]}>
                      {mappedCoinObj.currency_id}
                    </Text>
                  </View>
                  <Text style={styles.infoParagraph}>
                    {'Visit the token contract on Etherscan:'}
                  </Text>
                  <View style={styles.urlBox}>
                      <Text style={styles.urlText}>{getExplorerUrl()}</Text>
                  </View>
                  <GradientButton
                    onPress={() => {
                        setExplorerSheetVisible(false);
                        openUrl(getExplorerUrl());
                    }}
                  >
                    {'Open browser'}
                  </GradientButton>
                </View>
              </View>
            </SemiModal>
          </Portal>
        )}
      </View>
    </Portal.Host>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'white',
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  contentContainer: {
    paddingHorizontal: 20,
  },
  headerBlock: {
    backgroundColor: Colors.secondaryColor,
    paddingTop: 8,
    paddingBottom: 6,
  },
  headerContainer: {
    marginBottom: 8,
    marginTop: 8,
  },
  headerRightContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 8,
  },
  headerRightButton: {
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: 'black',
    marginLeft: 10,
  },
  tickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 38, // 28 (icon width) + 10 (margin left)
    flexWrap: 'wrap',
  },
  headerTicker: {
    fontSize: 14,
    fontWeight: '500',
    color: '#666666',
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingBottom: 16,
  },
  sheetHeaderSpacer: {
    width: 64,
  },
  sheetTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.quinaryColor,
  },
  sheetBody: {
    paddingHorizontal: 16,
    paddingBottom: 32,
    paddingTop: 8,
  },
  infoParagraph: {
    fontSize: 14,
    color: '#444444',
    lineHeight: 20,
    marginBottom: 16,
  },
  urlBox: {
    backgroundColor: '#F5F5F5',
    padding: 16,
    borderRadius: 12,
    marginBottom: 24,
  },
  urlText: {
    fontSize: 14,
    color: '#333333',
    lineHeight: 20,
    fontFamily: 'Courier', 
  },
  // FAB styles (like HomeFAB)
  fabContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  fabButtonRow: {
    backgroundColor: '#FFFFFF',
    paddingTop: 10,
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    paddingHorizontal: 16,
  },
  fabPrimaryButton: {
    width: 160,
    height: 44,
    borderRadius: 22,
  },
  fabActionButton: {
    borderRadius: 22,
    borderWidth: 0,
    backgroundColor: FAB_ACTION_BUTTON_COLOR,
    width: 160,
    elevation: 0,
    shadowColor: 'transparent',
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
  },
  fabActionContent: {
    height: 44,
  },
  fabActionLabel: {
    color: Colors.primaryColor,
    fontWeight: '700',
    fontSize: 16,
    letterSpacing: 0,
    textTransform: 'none',
  },
});

export default CoinMenus;
