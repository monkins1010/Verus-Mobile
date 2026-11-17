/*
  This component's purpose is to display a list of transactions for the 
  activeCoin, as set by the store. If transactions or balances are flagged
  as needing an update, it updates them upon mounting.
  
  2025-12-15: Updated transaction list with modern TransactionRow component:
  - Smaller icons in colored circular backgrounds
  - Relative timestamps
  - Fiat value display
  - Improved visual hierarchy
  
  2026-01-22: Added "Add to Address Book" functionality from transaction details.
  AddressBookEditSheet is managed at this level to avoid nested modal stacking issues.
*/

import React, { Component } from "react";
import {
  View,
  FlatList,
} from "react-native";
import { connect } from 'react-redux';
import { expireCoinData, expireServiceData, setActiveOverviewFilter } from '../../../actions/actionCreators';
import Styles from '../../../styles/index'
import { conditionallyUpdateService, conditionallyUpdateWallets, saveAddressToBook } from "../../../actions/actionDispatchers";
import store from "../../../store";
import TxDetailsModal from '../../../components/TxDetailsModal/TxDetailsModal'
import TransactionRow from '../../../components/TransactionRow';
import {
  API_GET_FIATPRICE,
  API_GET_BALANCES,
  API_GET_INFO,
  API_GET_TRANSACTIONS,
  ETH,
  API_GET_SERVICE_ACCOUNT,
  API_GET_SERVICE_PAYMENT_METHODS,
  API_GET_SERVICE_TRANSFERS,
  API_GET_SERVICE_RATES,
  API_GET_SERVICE_NOTIFICATIONS,
  IS_PBAAS_ROOT,
  IS_PBAAS,
  ERC20,
  GENERAL,
  WYRE_SERVICE
} from "../../../utils/constants/intervalConstants";
import { selectTransactions } from '../../../selectors/transactions';
import { DEFAULT_DECIMALS, ETHERS, VERUS_BRIDGE_DELEGATOR_GOERLI_CONTRACT, VERUS_BRIDGE_DELEGATOR_MAINNET_CONTRACT } from "../../../utils/constants/web3Constants";
import { Portal, Text } from "react-native-paper";
import BigNumber from "bignumber.js";
import { TransactionLogos } from '../../../images/customIcons/index'
import Colors from "../../../globals/colors";
import { CoinDirectory } from "../../../utils/CoinData/CoinDirectory";
import { USD } from "../../../utils/constants/currencies";
import AddressBookEditSheet from '../../AddressBook/components/AddressBookEditSheet';

const TX_LOGOS = {
  self: TransactionLogos.SelfArrow,
  out: TransactionLogos.OutArrow,
  in: TransactionLogos.InArrow,
  pending: TransactionLogos.PendingClock,
  unknown: TransactionLogos.Unknown,
  interest: TransactionLogos.InterestPlus,
}

const CONNECTION_ERROR = "Connection Error"

class Overview extends Component {
  constructor(props) {
    super(props);

    this.state = {
      parsedTxList: [],
      coinRates: {},
      loading: false,
      refreshing: false,
      txDetailsModalOpen: false,
      txDetailProps: {
        parsedAmount: "0",
        txData: {},
        activeCoinID: null,
        activeCoinExplorerId: null,
        activeCoinDisplayTicker: null,
        TxLogo: TX_LOGOS.unknown
      },
      // Address book sheet state
      addAddressSheetOpen: false,
      addressToAdd: '',
    };
    //this.updateProps = this.updateProps.bind(this);
    this.refresh = this.refresh.bind(this);
  }

  componentDidMount() {
    this.refresh();
    this._unsubscribeFocus = this.props.navigation.addListener('focus', () => {
      this.refresh();
    });
  }

  componentWillUnmount() {
    this._unsubscribeFocus()
  }

  refresh = (showLoading = false) => {
    // Only a pull-to-refresh shows the native spinner. A pull during an
    // automatic refresh shares its completion without starting another cycle.
    if (showLoading) this.setState({ refreshing: true });

    if (!this.state.loading) {
      this.setState({ loading: true }, async () => {
        const serviceUpdates = [
          API_GET_SERVICE_ACCOUNT,
          API_GET_SERVICE_PAYMENT_METHODS,
          API_GET_SERVICE_TRANSFERS,
          API_GET_SERVICE_RATES,
          API_GET_SERVICE_NOTIFICATIONS
        ]

        const coinUpdates = [
          API_GET_FIATPRICE,
          API_GET_BALANCES,
          API_GET_INFO,
          API_GET_TRANSACTIONS
        ];

        // Balance and transaction requests belong to the same refresh batch.
        // Start them before service work so notifications cannot hold them up.
        const walletRefresh = conditionallyUpdateWallets(
          store.getState(),
          this.props.dispatch,
          coinUpdates.map(updateId => ({
            chainTicker: this.props.activeCoin.id,
            updateId,
          })),
        ).catch(e => {
          console.warn('Error forcing wallet updates');
          console.warn(e);
        });

        for (const updateId of serviceUpdates) {
          try {
            await conditionallyUpdateService(store.getState(), this.props.dispatch, updateId);
          } catch (e) {
            console.warn('Error forcing update to ' + updateId);
            console.warn(e);
          }
        }

        await walletRefresh;
        this.setState({ loading: false, refreshing: false });
      });
    }
  };

  forceUpdate = () => {
    const coinObj = this.props.activeCoin;
    this.props.dispatch(expireCoinData(coinObj.id, API_GET_FIATPRICE));
    this.props.dispatch(expireCoinData(coinObj.id, API_GET_BALANCES));
    this.props.dispatch(expireCoinData(coinObj.id, API_GET_INFO));
    this.props.dispatch(expireCoinData(coinObj.id, API_GET_TRANSACTIONS));
    this.props.dispatch(expireServiceData(API_GET_SERVICE_ACCOUNT));
    this.props.dispatch(expireServiceData(API_GET_SERVICE_PAYMENT_METHODS));
    this.props.dispatch(expireServiceData(API_GET_SERVICE_TRANSFERS));
    this.props.dispatch(expireServiceData(API_GET_SERVICE_RATES));
    this.props.dispatch(expireServiceData(API_GET_SERVICE_NOTIFICATIONS));
    
    this.refresh(true);
  };

  _openDetails = item => {
    let navigation = this.props.navigation;
    navigation.navigate("TxDetails", {
      data: item
    });
  };

  handleAddToAddressBook = (address) => {
    this.setState({
      addressToAdd: address,
      addAddressSheetOpen: true,
    });
  };

  handleCloseAddAddressSheet = () => {
    this.setState({
      addAddressSheetOpen: false,
      addressToAdd: '',
    });
  };

  handleSaveAddress = async (addressData) => {
    const accountHash = this.props.activeAccount?.accountHash;
    if (accountHash) {
      await saveAddressToBook(addressData, accountHash);
    }
  };

  renderTransactionItem = ({ item, index }) => {
    const decimals =
      this.props.activeCoin.decimals != null
        ? this.props.activeCoin.decimals
        : DEFAULT_DECIMALS;
    let amount = BigNumber(0);
    let txType = "unknown";
    let address = "";
    const gasFees = item.feeCurr === ETH.toUpperCase();

    // Parse array-type transactions (combined send/receive)
    if (Array.isArray(item)) {
      const txArray = item;
      let toAddresses = [];
      const confirmed = txArray[0].confirmed;
      
      amount = BigNumber(txArray[0].amount).minus(txArray[1].amount);

      if (txArray[1].interest) {
        let interest = txArray[1].interest * -1;
        amount = amount.plus(interest);
      }

      for (let i = 0; i < txArray[0].to.length; i++) {
        if (txArray[0].to[i] !== txArray[0].from[0]) {
          toAddresses.push(txArray[0].to[i]);
        }
      }

      if (toAddresses.length > 1) {
        address = toAddresses[0] + " + " + (toAddresses.length - 1) + " more";
      } else {
        address = toAddresses[0];
      }

      txType = "sent";

      item = {
        address: toAddresses.join(' & '),
        amount,
        confirmed,
        fee: txArray[0].fee,
        from: txArray[0].from,
        timestamp: txArray[0].timestamp,
        to: toAddresses,
        txid: txArray[0].txid,
        type: "sent"
      };
    } else {
      amount = item.amount != null ? BigNumber(item.amount) : BigNumber(0);

      if (item.type === "received") {
        txType = "received";
        address = "me";
      } else if (item.type === "sent") {
        txType = "sent";
        address = item.address == null ? "??" : item.address;

        // Check for bridge contract addresses
        if (
          this.props.activeCoin.proto === ETH ||
          this.props.activeCoin.proto === ERC20
        ) {
          if (
            (!!(this.props.activeCoin.testnet) &&
              VERUS_BRIDGE_DELEGATOR_GOERLI_CONTRACT != null &&
              address.toLowerCase() === VERUS_BRIDGE_DELEGATOR_GOERLI_CONTRACT.toLowerCase()) ||
            (!this.props.activeCoin.testnet &&
              VERUS_BRIDGE_DELEGATOR_MAINNET_CONTRACT != null &&
              address.toLowerCase() === VERUS_BRIDGE_DELEGATOR_MAINNET_CONTRACT.toLowerCase())
          ) {
            address = 'Verus-Ethereum Bridge';
          }
        }
      } else if (item.type === "self") {
        if (item.amount !== "??" && amount.isLessThan(0)) {
          txType = "interest";
          address = "me";
          amount = amount.multipliedBy(-1);
        } else {
          txType = "self";
          address = gasFees ? "gas" : "fees";
        }
      } else {
        txType = "unknown";
        address = "??";
      }
    }

    // Calculate display amount
    let displayAmount = null;
    try { 
      if (!gasFees && item.fee && item.type !== "unknown") {
        displayAmount = amount.minus(item.fee).abs();
      } else {
        displayAmount = amount;
      }
    } catch(e) { 
      console.error(e);
    }

    // Calculate fiat value
    let fiatValue = null;
    const rate = this.getRate();
    if (rate != null && displayAmount != null) {
      fiatValue = displayAmount.abs().multipliedBy(rate).toNumber();
    }

    // Get explorer ID for detail modal
    let explorerId;
    try {
      explorerId = this.props.activeCoin.system_id && 
        this.props.activeCoin.tags.includes(IS_PBAAS) && 
        !this.props.activeCoin.tags.includes(IS_PBAAS_ROOT)
          ? CoinDirectory.findSystemCoinObj(this.props.activeCoin.id).id
          : this.props.activeCoin.id;
    } catch(e) { 
      console.warn(e);
    }

    // Determine ticker to display
    const displayTicker = item.feeCurr != null && item.type === "self"
      ? item.feeCurr
      : this.props.activeCoin.display_ticker;
    
    return (
      <TransactionRow
        type={txType}
        amount={displayAmount}
        address={address}
        timestamp={item.timestamp}
        confirmed={item.confirmed !== false && item.status !== "pending"}
        ticker={displayTicker}
        fiatValue={fiatValue}
        displayCurrency={this.props.displayCurrency}
        hasMemo={item.memo != null && item.memo.length > 0}
        decimals={decimals}
        onPress={() =>
          this.setState({
            txDetailProps: {
              displayAmount: displayAmount,
              txData: item,
              activeCoinID: this.props.activeCoin.id,
              activeCoinDisplayTicker: this.props.activeCoin.display_ticker,
              activeCoinExplorerId: explorerId,
              TxLogo: TX_LOGOS[txType] || TX_LOGOS.unknown,
              decimals: decimals,
              savedAddresses: this.props.savedAddresses,
              accountHash: this.props.activeAccount?.accountHash,
            },
            txDetailsModalOpen: true,
          })
        }
      />
    );
  };

  /**
   * Get the current fiat rate for the active coin
   * @returns {number|null} The exchange rate or null if not available
   */
  getRate = () => {
    const { rates, activeCoin, displayCurrency } = this.props;
    if (!rates || !activeCoin) return null;

    // Try WYRE_SERVICE first, then GENERAL
    const wyreRate = rates[WYRE_SERVICE]?.[activeCoin.id]?.[displayCurrency];
    if (wyreRate != null) return wyreRate;

    const generalRate = rates[GENERAL]?.[activeCoin.id]?.[displayCurrency];
    if (generalRate != null) return generalRate;

    return null;
  };

  parseTransactionLists = () => {
    const { transactions } = this.props
    let txs =
      transactions != null && transactions.results != null
        ? transactions.results
        : [];

    return txs.sort((a, b) => {
      a = Array.isArray(a) ? a[0] : a
      b = Array.isArray(b) ? b[0] : b
      
      if (a.timestamp == null) return -1
      else if (b.timestamp == null) return 1
      else if (b.timestamp == a.timestamp) return 0
      else if (b.timestamp < a.timestamp) return -1
      else return 1
    })
  }

  renderTransactionList = () => {
    return (
      <FlatList
        style={Styles.fullWidth}
        contentContainerStyle={{ flexGrow: 1 }}
        data={this.parseTransactionLists()}
        scrollEnabled={true}
        ListEmptyComponent={
          <View
            style={Styles.focalCenter}
          >
            <Text style={{...Styles.centeredText, fontSize: 16, color: Colors.verusDarkGray}}>
              {"No transactions found..."}
            </Text>
          </View>
        }
        keyExtractor={(item, index) => index}
        refreshing={this.state.refreshing}
        onRefresh={this.forceUpdate}
        renderItem={this.renderTransactionItem}
        //extraData={this.props.balances}
      />
    );
  };

  setOverviewFilter = (filter) => {
    this.props.dispatch(setActiveOverviewFilter(this.props.activeCoin.id, filter))
  }

  render() {
    return (
      <View style={Styles.defaultRoot}>
        {this.state.txDetailsModalOpen && (
          <Portal>
            <TxDetailsModal
              {...this.state.txDetailProps}
              cancel={() =>
                this.setState({
                  txDetailsModalOpen: false,
                  txDetailProps: {
                    parsedAmount: "0",
                    txData: {},
                    activeCoinID: null,
                    activeCoinDisplayTicker: null,
                    activeCoinExplorerId: null,
                    TxLogo: TX_LOGOS.unknown,
                    decimals:
                      this.props.activeCoin.decimals != null
                        ? this.props.activeCoin.decimals
                        : ETHERS,
                  },
                })
              }
              jumpTo={this.props.jumpTo}
              visible={this.state.txDetailsModalOpen}
              animationType="slide"
              onAddToAddressBook={this.handleAddToAddressBook}
            />
          </Portal>
        )}
        {this.renderTransactionList()}

        {/* Address Book Edit Sheet - rendered at Overview level to avoid nested modals */}
        <AddressBookEditSheet
          visible={this.state.addAddressSheetOpen}
          onClose={this.handleCloseAddAddressSheet}
          onSave={this.handleSaveAddress}
          initialAddress={this.state.addressToAdd}
          editMode={false}
        />
      </View>
    );
  }
}

const mapStateToProps = (state) => {
  return {
    activeCoin: state.coins.activeCoin,
    transactions: selectTransactions(state),
    activeAccount: state.authentication.activeAccount,
    activeCoinsForUser: state.coins.activeCoinsForUser,
    generalWalletSettings: state.settings.generalWalletSettings,
    rates: state.ledger.rates,
    displayCurrency: state.settings.generalWalletSettings.displayCurrency || USD,
    savedAddresses: state.addressBook.addresses,
  }
};

export default connect(mapStateToProps)(Overview);
