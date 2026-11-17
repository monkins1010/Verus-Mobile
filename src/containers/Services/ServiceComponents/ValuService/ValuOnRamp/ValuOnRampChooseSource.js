/*
  Updated file: ValuOnRampChooseSource
  - Redesigned Buy screen to match Coinbase's modern, clean style
  - Large "You Pay" input with smaller "You Receive" display below
  - Full-width keypad at bottom with modern styling and shadows
  - Small country selector chip in top-right corner
  - Modern CTA button with HomeFAB styling (rounded, shadows)
  - Light background with card-based input containers
  - Removed amount suggestion chips for cleaner interface
  - Fee display condensed to single line with better typography
  - Compact responsive layout for small devices
    • Local compact rule: height <= 667 OR width <= 375 (iPhone SE class)
    • Reduce keypad height/spacing and typography sizes
    • Tighten options list spacing and ensure CTA remains visible
  - Payment methods displayed in shared ValuPaymentMethodSheet with fee and limit details
  - Normalizes payment method labels/icons using shared metadata helper
  - Updated disclosure copy to highlight Paybis partnership and vUSDC.vETH deposits
  - Fixed review "Receive" value formatting to respect locale-specific separators
  - Keeps UI active during quote refresh with inline spinner and receive skeleton
  - Intercepts back navigation from review screen to return user to amount selection step
  - Aligns CTA typography across review flow buttons
  - Fixed vertical alignment of CTA button label
  - Selected payment method now shows provider-specific icon with 32px footprint
  - 2026-10-30: Options can come from Paybis or MoonPay; disclosure copy, link and acceptance follow the selected provider
*/

import React, { Component } from "react";
import { connect } from 'react-redux';
import { primitives } from "verusid-ts-client";
import {
  SafeAreaView,
  ScrollView,
  View,
  TouchableWithoutFeedback,
  Linking,
  StyleSheet,
  Alert,
  Keyboard,
  TouchableOpacity,
  Platform,
  Dimensions,
  Image,
  AppState,
} from 'react-native';
import {
  Button,
  Text,
  Portal,
  ActivityIndicator,
} from 'react-native-paper';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import InAppBrowser from 'react-native-inappbrowser-reborn';
import { formatCurrency } from "react-native-format-currency";
import {CommonActions} from '@react-navigation/native';

// Local imports
import Styles from "../../../../../styles";
import Colors from '../../../../../globals/colors';
import { Valu, VUSDC, USDCIcon } from "../../../../../images/customIcons";
import ValuProvider from "../../../../../utils/services/ValuProvider";
import { ISO_3166_COUNTRIES } from "../../../../../utils/constants/iso3166";
import ListSelectionModal from "../../../../../components/ListSelectionModal/ListSelectionModal";
import { requestPersonalData } from "../../../../../utils/auth/authBox";
import { PERSONAL_LOCATIONS } from "../../../../../utils/constants/personal";
import { modifyPersonalDataForUser } from "../../../../../actions/actionDispatchers";
import { createAlert, resolveAlert } from '../../../../../actions/actions/alert/dispatchers/alert';
import { initiateOnrampRequest, completeOnrampRequest } from "../../../../../actions/actions/channels/valu/dispatchers/ValuWalletReduxManager";
import NumericKeypad from '../../../../../components/Keypad/NumericKeypad';
import { saveGeneralSettings } from "../../../../../actions/actionCreators";
import ValuPaymentMethodSheet from '../shared/ValuPaymentMethodSheet';
import { normalizePaymentMethodLabel, getPaymentMethodMeta, getProviderMeta } from '../shared/valuPaymentMethodMeta';
import Svg, { Defs, LinearGradient as SvgLinearGradient, Stop, Rect } from 'react-native-svg';
import GradientButton from "../../../../../components/GradientButton";

// Constants
const ALLOWED_COUNTRIES = ["US", "CA", "GB", "AT", "BE", "CY", "CZ", "EE", "FI", "FR", "DE", 
  "GR", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PT", "RO", "SK", "SI", "ES"];

const getOnrampDisclosureParagraphs = (providerMeta) => [
  `${providerMeta.label} is our licensed payments partner and securely handles your checkout.`,
  "Your purchase will be deposited as USDC to your Ethereum wallet address."
];

const getOnrampDisclosureMessage = (providerMeta) => {
  const [partner, deposit] = getOnrampDisclosureParagraphs(providerMeta);
  const learnMore = providerMeta.url ? ` Learn more at ${providerMeta.url.replace(/^https?:\/\/(www\.)?/, '')}.` : '';
  return `${partner}${learnMore}\n\n${deposit}`;
};

// Paybis keeps the original V1 key so users who already accepted are not asked again
const getOnrampDisclosureSettingKey = (providerMeta) =>
  providerMeta.key === 'paybis'
    ? 'valuOnrampDisclosureAcceptedV1'
    : `valuOnrampDisclosureAccepted_${providerMeta.key}`;

class ValuOnRampChooseSource extends Component {
  beforeRemoveUnsubscribe = null;

  constructor(props) {
    super(props);

    const Ticker = Object.keys(props.activeAccount.testnetOverrides).length > 0 ? "VRSCTEST" : "VRSC";
    const addresses = props.allSubWallets[Ticker] || [];

    const partnerUserId = props.valuService.partnerUserId || null;

    if (partnerUserId == null) {
      throw new Error("No partner user ID found for Valu service");
    }

    this.state = {
      radioValue: null, // Changed from 0 to null to force explicit selection
      amount: "100",
      converted: 0,
      taxCountry: null,
      currency: "USD",
      countryModalOpen: false,
      addressModalOpen: false,
      options: [],
      loading: false,
      updatingfee: false,
      totalFee: "0",
      error: null,
      mainVerusNetwork: Ticker,
      addresses,
      chosenAddress: (props.initialAddress ? props.initialAddress : (addresses[0] || {})),
      locations: {},
      partnerUserId: partnerUserId,
      paymentSheetVisible: false,
      reviewVisible: false,
      congratsVisible: false
    };
    
    const decimalSample = (1.1).toLocaleString();
    this.decimalSeparator = decimalSample.replace(/1/g, '').charAt(0) || '.';
    
    this.handleChange = this.handleChange.bind(this);
    this.openAddressModal = this.openAddressModal.bind(this);
    this.startOnRamp = this.startOnRamp.bind(this);
  }

  async componentDidMount() {
    this.beforeRemoveUnsubscribe = this.props.navigation.addListener('beforeRemove', this.handleBeforeRemove);
    this.updateNavigationForReview(this.state.reviewVisible);
    await this.initialize();
  }

  componentWillUnmount() {
    if (typeof this.beforeRemoveUnsubscribe === 'function') {
      this.beforeRemoveUnsubscribe();
    }
  }

  componentDidUpdate(prevProps, prevState) {
    if (prevState.reviewVisible !== this.state.reviewVisible) {
      this.updateNavigationForReview(this.state.reviewVisible);
    }
  }

  handleBeforeRemove = (event) => {
    if (this.state.reviewVisible) {
      event.preventDefault();
      this.setState({ reviewVisible: false });
    }
  };

  updateNavigationForReview(isReview) {
    if (!this.props.navigation?.setOptions) return;

    const commonOptions = {
      headerRight: () => null,
      headerShadowVisible: false,
      headerStyle: {
        backgroundColor: 'white',
        elevation: 0,
        shadowOpacity: 0,
      },
    };

    if (isReview) {
      this.props.navigation.setOptions({
        ...commonOptions,
        headerTitle: '',
        headerBackTitle: 'Edit order',
      });
    } else {
      this.props.navigation.setOptions({
        ...commonOptions,
        headerTitle: '',
        headerBackTitle: 'Back',
      });
    }
  }

  async connectionError() {
    createAlert(
      "Failed to Connect to Valu",
      "Please try again soon.  We apologise for the inconvenience",
      [
        {
          text: 'back',
          onPress: () => {resolveAlert(false); this.props.navigation.goBack()},
          style: 'cancel',
        },
        {
          text: 'TRY AGAIN', 
          onPress: async () => {
            try {
              await this.initialize();
  
              resolveAlert(true);
            } catch (error) {
              console.error("Error starting on-ramp:", error);
              this.connectionError();
              resolveAlert(false);
            }
          }
        },
      ],
      { cancelable: false }
    );
  }
  
  async initialize() {

    this.setState({ loading: true });
    
    try {
      const location = await requestPersonalData(PERSONAL_LOCATIONS);
      const countryCode = location?.tax_countries?.[0]?.country || "US";
      const amount = this.state.amount;
      
      const valuReply = await ValuProvider.getOnRampOptions({ 
        countryCode, 
        amount,
        partnerUserId: this.state.partnerUserId 
      });
      
      const currentSelection = this.state.radioValue;
      const selectedOption =
        currentSelection != null && valuReply.options
          ? valuReply.options[currentSelection]
          : null;
      const fee = selectedOption?.feePercentage || 0;
      const cryptoReceived = selectedOption?.amountReceived || 0;
      const formattedValue = selectedOption
        ? formatCurrency({
            amount: Number(cryptoReceived).toFixed(2),
            code: valuReply.currency || 'USD',
          })
        : [];

      const attestationStatus = valuReply.attestationStatus || null;

      if (attestationStatus && attestationStatus.data === "demo_mock_data") {
        // If demo data, show a mock attestation ready
        this.handleTransactionComplete({ success: true }, attestationStatus);
  
      }

      this.setState({
        locations: location,
        taxCountry: location?.tax_countries?.[0] || {},
        currency: valuReply.currency || "USD",
        options: valuReply.options || [],
        converted: formattedValue?.[1] || this.state.converted,
        totalFee: selectedOption ? (Number(amount) * (fee / 100)).toFixed(2) : "0",
        loading: false,
      });
    } catch (error) {
      this.connectionError();
    }
  }

  updateTaxCountry() {
    this.setState({ loading: true }, async () => {
      try {
        const taxCountries = [this.state.taxCountry];
        
        await modifyPersonalDataForUser(
          { ...this.state.locations, tax_countries: taxCountries },
          PERSONAL_LOCATIONS,
          this.props.activeAccount.accountHash
        );
      } catch (error) {
        console.error("Error updating tax country:", error);
      } finally {
        this.setState({ loading: false });
      }
    });
  }

  resetToScreen = () => {
      const resetAction = CommonActions.reset({
              index: 0,
              routes: [{name: 'SignedInStack'}],
            });

      this.props.navigation.dispatch(resetAction);
    };


  // Handle navigation to attestation acceptance screen
  navigateToAttestationAccept = (attestation, transactionData) => {
    
    if (this.props.setSubScreen) {
      // Use the setSubScreen method from parent ValuServiceAccount
  
      this.props.setSubScreen('attestationAccept', {
        attestation: attestation,
        transactionData: transactionData
      });
    } else {
      // Fallback to direct navigation if setSubScreen is not available
      
      try {
        // Try using push instead of navigate to ensure a new screen instance
        this.props.navigation.push('ValuAttestationAccept', {
          attestation: attestation,
          transactionData: transactionData
        });
      } catch (error) {
        console.error('Navigation error:', error);
        // Fallback: try standard navigate
        this.props.navigation.navigate('ValuAttestationAccept', {
          attestation: attestation,
          transactionData: transactionData
        });
      }
    }
  };

  // Method to be called when transaction completes and attestation is available
  handleTransactionComplete = (transactionResult, attestation = null) => {
    const transactionData = {
      amount: this.state.amount,
      currency: this.state.currency,
      received: this.state.converted,
      address: this.state.chosenAddress?.name || 'Your Wallet',
      provider: this.state.options[this.state.radioValue]?.provider || 'Payment Provider'
    };

    if (attestation) {
      // Navigate to attestation acceptance screen
      this.navigateToAttestationAccept(attestation, transactionData);
    } else {
      // No attestation available, just go back to main screen
      this.resetToScreen();
    }
  };

  // Resolves the next time the app comes back to the foreground (external browser flow)
  waitForAppActive() {
    return new Promise((resolve) => {
      const subscription = AppState.addEventListener('change', (state) => {
        if (state === 'active') {
          subscription.remove();
          resolve();
        }
      });
    });
  }

  // Polls the order outcome briefly: provider webhooks can arrive a few seconds after the
  // checkout page closes. Returns 'paid' | 'pending' | 'not_paid' | 'failed' | null (unknown).
  async fetchOnrampOutcome(requestId, attempts = 4, delayMs = 2000) {
    let outcome = null;
    for (let i = 0; i < attempts; i++) {
      try {
        const res = await ValuProvider.getOnRampStatus(requestId);
        outcome = res?.outcome || null;
      } catch (e) {
        console.warn('Could not check on-ramp order status:', e?.message || e);
        outcome = null;
      }
      if (outcome === 'paid' || outcome === 'pending' || outcome === 'failed') return outcome;
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, delayMs));
    }
    return outcome;
  }

  async handleCheckoutClosed(requestId) {
    if (!requestId) {
      this.setState({ congratsVisible: true });
      return;
    }

    this.setState({ loading: true });
    const outcome = await this.fetchOnrampOutcome(requestId);
    this.setState({ loading: false });

    if (outcome === 'paid' || outcome === 'pending') {
      this.setState({ congratsVisible: true });
    } else if (outcome === 'not_paid') {
      completeOnrampRequest(requestId);
      Alert.alert("Purchase not completed", "The checkout was closed before payment, so you have not been charged.");
    } else if (outcome === 'failed') {
      completeOnrampRequest(requestId);
      Alert.alert("Payment failed", "The payment provider did not complete this purchase. You have not been charged for it.");
    } else {
      Alert.alert(
        "Purchase status unknown",
        "We couldn't confirm this purchase yet. If you completed the payment, your USDC will arrive shortly and you'll be able to see it in your wallet."
      );
    }
  }

  async startOnRamp() {
    // Extra safety: prevent starting if an inline error is present or amount is empty or no payment option selected
    if (this.state.error != null || this.state.amount === "" || this.state.radioValue === null) return;

    this.setState({ reviewVisible: false });

    const continueToCheckout = async () => {
      try {
        const { options, radioValue, amount, taxCountry } = this.state;
        const reply = await ValuProvider.getOnRampURL({
          option: options[radioValue],
          amount,
          countryCode: taxCountry.country,
          address: this.state.chosenAddress.id,
          partnerUserId: this.state.partnerUserId
        });

        initiateOnrampRequest(reply.requestId, reply.details);

        if (await InAppBrowser.isAvailable()) {
          await InAppBrowser.open(reply.url, {
            // iOS Properties
            dismissButtonStyle: 'cancel',
            preferredBarTintColor: '#00A1CC',
            preferredControlTintColor: 'white',
            readerMode: false,
            animated: true,
            modalPresentationStyle: 'fullScreen',
            modalTransitionStyle: 'coverVertical',
            modalEnabled: true,
            enableBarCollapsing: false,
            // Android Properties
            showTitle: false,
            toolbarColor: '#00A1CC',
            secondaryToolbarColor: 'black',
            navigationBarColor: 'black',
            navigationBarDividerColor: 'white',
            enableUrlBarHiding: true,
            enableDefaultShare: false,
            forceCloseOnRedirection: false,
            hasBackButton: false,  // Prevent back button from closing the browser
            waitForRedirectDelay: 500, // Give redirects more time to process
            showInRecents: true,   // Keep in Android recents
            ephemeralWebSession: false, // Maintain cookies and session data
            animations: {
              startEnter: 'slide_in_right',
              startExit: 'slide_out_left',
              endEnter: 'slide_in_left',
              endExit: 'slide_out_right'
            }
          });
          // Browser closed. That alone says nothing about payment (the user may have
          // tapped X), so ask the server what happened to the order.
          await this.handleCheckoutClosed(reply.requestId);
        } else {
          await Linking.openURL(reply.url);
          await this.waitForAppActive();
          await this.handleCheckoutClosed(reply.requestId);
        }
      } catch (error) {
        console.error("Error starting on-ramp:", error);
        Alert.alert("Error", "Failed to start the purchase process. Please try again.");
      }
    };

    const providerMeta = getProviderMeta(this.getSelectedOption()?.provider);
    const disclosureSettingKey = getOnrampDisclosureSettingKey(providerMeta);
    const hasAccepted = this.props.generalWalletSettings &&
      this.props.generalWalletSettings[disclosureSettingKey] === true;

    if (!hasAccepted) {
      createAlert(
        "Before you continue",
        getOnrampDisclosureMessage(providerMeta),
        [
          {
            text: 'Cancel',
            onPress: () => resolveAlert(false),
            style: 'cancel',
          },
          {
            text: 'Got it',
            onPress: async () => {
              try {
                await this.props.dispatch(await saveGeneralSettings({ [disclosureSettingKey]: true }));
              } catch(e) {
                // Non-fatal if persistence fails; still continue
                console.warn('Failed to persist on-ramp disclosure acceptance', e);
              }
              resolveAlert(true);
              continueToCheckout();
            }
          },
        ],
        { cancelable: true }
      );
      return;
    }

    // Already accepted
    await continueToCheckout();
  }

  validateAmount(value, min, max) {
    if (isNaN(value)) {
      this.setState({ error: " - Please enter a valid number" });
      return false;
    }

    if (Number(value) < Number(min)) {
      const formattedMin = this.formatCurrencyValue(min, { includeDecimals: false, includeSymbol: true });
      this.setState({ error: ` - Minimum ${formattedMin || min}` });
      return false;
    }

    if (Number(value) > Number(max)) {
      const formattedMax = this.formatCurrencyValue(max, { includeDecimals: false, includeSymbol: true });
      this.setState({ error: ` - Maximum ${formattedMax || max}` });
      return false;
    }

    this.setState({ error: null });
    return true;
  }

  handleChange(value = null, countryCode = null) {
    const youPay = value !== null && value !== undefined ? value : this.state.amount;

    if (youPay === '') {
      this.setState({ amount: '', error: null, loading: false, updatingfee: false });
      return;
    }

    if (youPay.includes('.') && youPay.split('.')[1]?.length > 2) {
      return;
    }

    const shouldShowFullLoading = !this.state.options || this.state.options.length === 0;

    this.setState(
      shouldShowFullLoading
        ? { loading: true, updatingfee: false, amount: youPay }
        : { updatingfee: true, amount: youPay },
      async () => {
      try {
        const currentSelection = this.state.radioValue;
        const selectedCountry = countryCode || this.state.taxCountry.country;
        
        const valuReply = await ValuProvider.getOnRampOptions({ 
          countryCode: selectedCountry, 
          amount: youPay,
          partnerUserId: this.state.partnerUserId
        });

        const options = valuReply.options || [];
        const hasSelection =
          currentSelection != null && options[currentSelection] != null;
        const selectedOption = hasSelection ? options[currentSelection] : null;

        if (hasSelection) {
          this.validateAmount(
            youPay,
            selectedOption.minAmount,
            selectedOption.maxAmount
          );
        }

        const fee = selectedOption?.feePercentage || 0;
        const cryptoReceived = selectedOption?.amountReceived || 0;
        const formattedValue =
          selectedOption != null
            ? formatCurrency({
                amount: Number(cryptoReceived).toFixed(2),
                code: valuReply.currency || 'USD',
              })
            : [];

        const updates = {
          totalFee: selectedOption
            ? (Number(youPay) * (fee / 100)).toFixed(2)
            : "0",
          options,
          converted: formattedValue?.[1] || this.state.converted,
          loading: false,
          updatingfee: false,
        };

        if (!hasSelection) {
          updates.radioValue = null;
        }

        if (countryCode) {
          updates.taxCountry = {
            ...this.state.taxCountry,
            country: countryCode,
          };
          updates.currency = valuReply.currency;
          updates.radioValue = null;
        }

        this.setState(updates, () => {
          if (countryCode) {
            this.updateTaxCountry();
          }
        });
      } catch (error) {
        console.error("Error handling change:", error);
        this.setState({
          loading: false,
          updatingfee: false,
          error: " - Failed to update values"
        });
      }
    });
  }

  openAddressModal() {
    this.setState({ addressModalOpen: true });
  }

  // Render helper methods to break down the UI
  renderCurrencyInputs() {
    const { height, width } = Dimensions.get('window');
    const isSmall = height <= 667 || width <= 375;
    
    const formatAmount = (raw = "") => {
      if (raw == null || raw === "") return "0";
      const stringValue = String(raw);
      const [intPart = "0", fracPart] = stringValue.split('.');
      let formattedInt = intPart;

      if (/^-?\d+$/.test(intPart)) {
        formattedInt = Number(intPart).toLocaleString(undefined, { useGrouping: true });
      } else if (intPart === "" && stringValue.startsWith('.')) {
        formattedInt = "0";
      }

      const decimalSeparator = this.decimalSeparator || '.';
      return fracPart != null ? `${formattedInt}${decimalSeparator}${fracPart}` : formattedInt;
    };

    // Use raw amount for display, only format if it has content
    const displayAmount = this.state.amount === "" ? "0" : formatAmount(this.state.amount);

    if (this.state.loading) {
      return (
        <View style={{ alignItems: 'center', marginTop: 8 }}>
          <View style={{ width: '90%' }}>
            <View style={styles.skeletonAmountWrapper}>
              <View style={[styles.skeletonBlockLarge, isSmall ? styles.skeletonBlockLargeSmall : null]} />
            </View>
          </View>
        </View>
      );
    }

    return (
      <View style={{ alignItems: 'center', marginTop: 8 }}>
        {/* Large You Pay input - no background, very large */}
        <View style={{ width: '90%', marginBottom: 8 }}>
            <Text style={{ fontSize: 14, color: '#666', marginBottom: 8, textAlign: 'left' }}>You pay</Text>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'flex-start', width: '100%' }}>
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit={true}
              minimumFontScale={0.5}
              style={[styles.extraLargeAmountInline, isSmall ? styles.extraLargeAmountInlineSmall : null]}
            >
              {displayAmount}
              <Text style={[styles.extraLargeCurrencyInline, isSmall ? styles.extraLargeCurrencyInlineSmall : null]}>{`\u2009${this.state.currency}`}</Text>
            </Text>
          </View>
          <Text style={{ fontSize: 14, color: '#666', marginBottom: 8, textAlign: 'left' }}>{`To: ${this.state.chosenAddress.name || ''}`}</Text>
        </View>
      </View>
    );
  }

  getSelectedOption = () => {
    const { options, radioValue } = this.state;
    if (radioValue == null || !Array.isArray(options)) return null;
    return options[radioValue] || null;
  };

  formatCurrencyValue = (amount, options = {}) => {
    const { currency } = this.state;
    if (amount == null || amount === "") return null;

    const { includeDecimals = true, includeSymbol = false } = options;
    const fixedAmount = includeDecimals 
      ? Number(amount).toFixed(2) 
      : Math.floor(Number(amount)).toString();

    try {
      const formatted = formatCurrency({
        amount: fixedAmount,
        code: currency || 'USD',
      });
      // formatted is [formattedWithSymbol, formattedNumber, symbol]
      // If includeSymbol, return the full formatted value with symbol (index 0)
      // Otherwise, return just the number (index 1)
      return includeSymbol ? formatted?.[0] || null : formatted?.[1] || null;
    } catch (error) {
      const fallback = includeSymbol 
        ? `${currency || ''}${fixedAmount}`.trim()
        : `${fixedAmount} ${currency || ''}`.trim();
      return fallback;
    }
  };

  formatTokenAmount = (amount) => {
    if (amount == null) return null;
    const numericAmount = Number(amount);
    if (Number.isNaN(numericAmount)) return null;

    try {
      return numericAmount.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
    } catch (error) {
      return numericAmount.toFixed(2);
    }
  };

  buildLimitLabel = (option) => {
    if (!option) return null;

    const max = this.formatCurrencyValue(option.maxAmount, { includeDecimals: false, includeSymbol: true });

    if (max) return `${max} limit`;
    return null;
  };

  renderPaymentSelector() {
    const { options, radioValue, loading } = this.state;
    const selectedOption =
      radioValue != null && options && options[radioValue]
        ? options[radioValue]
        : null;

    const rawMax =
      selectedOption && selectedOption.maxAmount != null
        ? this.formatCurrencyValue(selectedOption.maxAmount, { includeDecimals: false, includeSymbol: true })
        : null;
    const paymentLabel = selectedOption
      ? normalizePaymentMethodLabel(selectedOption.paymentMethod) || selectedOption.paymentMethod
      : null;
    const amountReceivedRaw =
      selectedOption && selectedOption.amountReceived != null
        ? Number(selectedOption.amountReceived)
        : null;
    const formattedReceived =
      amountReceivedRaw != null && !Number.isNaN(amountReceivedRaw)
        ? this.formatTokenAmount(amountReceivedRaw)
        : null;
    if (loading) {
      return (
        <View style={styles.paymentSelectorContainer}>
          <View style={styles.paymentSelectorSurface}>
            <View style={styles.paymentSelectorRowFlat}>
              <View style={styles.skeletonIconPlaceholder} />
              <View style={styles.paymentSelectorTextColumn}>
                <View style={styles.skeletonTextLine} />
                <View style={styles.skeletonTextLineShort} />
              </View>
              <View style={styles.skeletonChevronPlaceholder} />
            </View>
            <View style={styles.paymentSelectorVerticalLine} />
            <View style={styles.paymentSelectorRowFlat}>
              <View style={styles.skeletonIconPlaceholder} />
              <View style={styles.paymentSelectorTextColumn}>
                <View style={styles.skeletonTextLine} />
                <View style={styles.skeletonTextLineShort} />
              </View>
              <MaterialCommunityIcons name="chevron-right" size={24} color="transparent" />
            </View>
          </View>
        </View>
      );
    }

    const renderSelectedPaymentIcon = () =>
      this.renderPaymentMethodIcon(selectedOption?.paymentMethod);

    return (
      <View style={styles.paymentSelectorContainer}>
        <View style={styles.paymentSelectorSurface}>
          <TouchableOpacity
            onPress={() => this.setState({ paymentSheetVisible: true })}
            activeOpacity={0.7}
            disabled={loading}
          >
            <View style={styles.paymentSelectorRowFlat}>
              {renderSelectedPaymentIcon()}
              <View style={styles.paymentSelectorTextColumn}>
                <Text style={styles.paymentSelectorFlatLabel}>Pay with</Text>
                <Text style={styles.paymentSelectorFlatValue}>
                  {paymentLabel || 'Select payment method'}
                </Text>
              </View>
              {selectedOption && rawMax ? (
                <View style={styles.paymentSelectorLimitGroup}>
                  <Text style={styles.paymentSelectorLimitValue}>{rawMax}</Text>
                  <Text style={styles.paymentSelectorLimitLabel}>Limit</Text>
                </View>
              ) : null}
              <MaterialCommunityIcons name="chevron-right" size={24} color="#888" />
            </View>
          </TouchableOpacity>

          <View style={styles.paymentSelectorVerticalLine} />

          <View style={styles.paymentSelectorRowFlat}>
            <View style={styles.paymentMethodIconWrapper}>
              <Image source={USDCIcon} style={styles.paymentSelectorUSDCIcon} />
            </View>
            <View style={styles.paymentSelectorTextColumn}>
              <Text style={styles.paymentSelectorFlatLabel}>Buy</Text>
              <View style={styles.paymentSelectorAmountRow}>
                {selectedOption ? (
                  this.state.updatingfee ? (
                    <View style={styles.paymentSelectorAmountSkeleton} />
                  ) : formattedReceived ? (
                    <Text style={styles.paymentSelectorAmountValue}>{formattedReceived}</Text>
                  ) : null
                ) : null}
                <Text style={styles.paymentSelectorTokenText}>USDC</Text>
              </View>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={24} color="transparent" />
          </View>
        </View>
      </View>
    );
  }

  renderPaymentMethodIcon(method) {
    const meta = getPaymentMethodMeta(method);
    const iconConfig = meta?.icon || {};

    if (iconConfig.type === 'svg' && iconConfig.Component) {
      const SvgIcon = iconConfig.Component;
      return (
        <View style={styles.paymentMethodIconWrapper}>
          <SvgIcon width={32} height={16} preserveAspectRatio="xMidYMid meet" />
        </View>
      );
    }

    if (iconConfig.type === 'image' && iconConfig.source) {
      return (
        <View style={styles.paymentMethodIconWrapper}>
          <Image source={iconConfig.source} style={styles.paymentMethodImage} resizeMode="contain" />
        </View>
      );
    }

    return (
      <View style={styles.paymentMethodIconWrapper}>
        <MaterialCommunityIcons
          name={iconConfig.name || 'credit-card-outline'}
          size={24}
          color={iconConfig.color || '#1A1A1A'}
        />
      </View>
    );
  }

  renderPaymentMethodSheet() {
    return (
      <ValuPaymentMethodSheet
        visible={this.state.paymentSheetVisible}
        onDismiss={() => this.setState({ paymentSheetVisible: false })}
        options={this.state.options}
        selectedIndex={this.state.radioValue}
        currency={this.state.currency}
        amount={this.state.amount}
        mode="buy"
        onSelect={(option, index) => {
          const amountValue = this.state.amount === "" ? "0" : this.state.amount;
          const amountNumber = Number(amountValue);
          const fee = option?.feePercentage || 0;
          const totalFee = option
            ? (amountNumber * (fee / 100)).toFixed(2)
            : "0";
          const formattedValue =
            option != null
              ? formatCurrency({
                  amount: Number(option.amountReceived || 0).toFixed(2),
                  code: this.state.currency || 'USD',
                })
              : [];

          this.setState(
            {
              radioValue: index,
              totalFee,
              converted: formattedValue?.[1] || this.state.converted,
              error: null,
            },
            () => {
              if (option && this.state.amount !== "") {
                this.validateAmount(
                  this.state.amount,
                  option.minAmount,
                  option.maxAmount
                );
              }
            }
          );
        }}
      />
    );
  }

  handleReviewPress = () => {
    if (
      this.state.loading ||
      this.state.error != null ||
      this.state.amount === "" ||
      this.state.radioValue === null
    ) {
      return;
    }

    this.setState({ reviewVisible: true });
  };

  closeReview = () => {
    this.setState({ reviewVisible: false });
  };

  renderReviewScreen(isSmall) {
    const selectedOption = this.getSelectedOption();
    const amountNumber = Number(this.state.amount || 0);
    const formattedAmount =
      this.formatCurrencyValue(this.state.amount || 0, { includeDecimals: false, includeSymbol: true }) ||
      `${amountNumber.toFixed(2)} ${this.state.currency}`;
    const paymentLabel = selectedOption
      ? normalizePaymentMethodLabel(selectedOption.paymentMethod) || selectedOption.paymentMethod
      : null;
    const providerMeta = getProviderMeta(selectedOption?.provider);
    const disclosureParagraphs = getOnrampDisclosureParagraphs(providerMeta);

    const amountReceived =
      selectedOption && selectedOption.amountReceived != null
        ? Number(selectedOption.amountReceived)
        : 0;
    
    const formattedReceivedBase =
      this.formatCurrencyValue(amountReceived, { includeDecimals: true, includeSymbol: false }) ||
      amountReceived.toFixed(2);
    const formattedReceived =
      this.state.currency && formattedReceivedBase.endsWith(` ${this.state.currency}`)
        ? formattedReceivedBase.slice(0, -(` ${this.state.currency}`).length)
        : formattedReceivedBase;

    const feePercentage =
      selectedOption && selectedOption.feePercentage != null
        ? Number(selectedOption.feePercentage)
        : null;
    const feeAmount =
      feePercentage != null ? amountNumber * (feePercentage / 100) : 0;
    const networkFeeFiatRaw =
      selectedOption && selectedOption.networkFeeFiat != null
        ? Number(selectedOption.networkFeeFiat)
        : null;
    const serviceFeePercentageRaw =
      selectedOption && selectedOption.serviceFeePercentage != null
        ? Number(selectedOption.serviceFeePercentage)
        : feePercentage;
    const serviceFeeFiatRaw =
      selectedOption && selectedOption.serviceFeeFiat != null
        ? Number(selectedOption.serviceFeeFiat)
        : serviceFeePercentageRaw != null
        ? Math.max(amountNumber * (serviceFeePercentageRaw / 100) - (networkFeeFiatRaw || 0), 0)
        : null;
    const totalFeeFiatRaw =
      (networkFeeFiatRaw != null ? networkFeeFiatRaw : 0) +
      (serviceFeeFiatRaw != null ? serviceFeeFiatRaw : 0);
    const bankFeeFiatRaw =
      selectedOption && selectedOption.payoutfee != null
        ? Number(selectedOption.payoutfee)
        : 0;
    const formattedNetworkFee =
      networkFeeFiatRaw != null
        ? this.formatCurrencyValue(networkFeeFiatRaw, { includeDecimals: true, includeSymbol: true })
        : null;
    const formattedServiceFeePercentage =
      serviceFeePercentageRaw != null && !Number.isNaN(serviceFeePercentageRaw)
        ? `${serviceFeePercentageRaw.toLocaleString(undefined, {
            minimumFractionDigits: 1,
            maximumFractionDigits: 1,
          })}%`
        : null;
    const totalFeeWithBank =
      (totalFeeFiatRaw != null ? totalFeeFiatRaw : 0) + (bankFeeFiatRaw || 0);
    const formattedTotalFee =
      totalFeeWithBank != null && totalFeeWithBank > 0
        ? this.formatCurrencyValue(totalFeeWithBank, { includeDecimals: true, includeSymbol: true })
        : null;

    const formatFeeAmount = (value) =>
      value != null && value > 0
        ? this.formatCurrencyValue(value, { includeDecimals: true, includeSymbol: true })
        : '—';

    const formattedNetworkFeeAmount = formatFeeAmount(networkFeeFiatRaw);
    const formattedServiceFeeAmount = formatFeeAmount(serviceFeeFiatRaw);
    const formattedBankFeeAmount = formatFeeAmount(bankFeeFiatRaw);
    const formattedTotalFeeAmount = formatFeeAmount(totalFeeWithBank);
    const showBankFee = bankFeeFiatRaw != null && bankFeeFiatRaw > 0;
    const netAmountNumber =
      totalFeeFiatRaw != null ? Math.max(amountNumber - totalFeeFiatRaw, 0) : amountNumber;
    const effectivePrice =
      selectedOption && amountReceived > 0 && netAmountNumber != null
        ? netAmountNumber / amountReceived
        : null;
    const formattedPrice = effectivePrice
      ? this.formatCurrencyValue(effectivePrice, { includeDecimals: true, includeSymbol: true })
      : null;

    const baseError = this.state.error
      ? this.state.error.replace(/^ -\s*/, '')
      : null;
    const errorMessage = baseError;
    const actionDisabled = this.state.loading || !!errorMessage;
    return (
      <View style={styles.reviewContainer}>
        <ScrollView
          style={styles.reviewScroll}
          contentContainerStyle={{ paddingBottom: isSmall ? 24 : 32 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Centered icon and title */}
          <View style={styles.reviewHero}>
            <Image source={USDCIcon} style={styles.reviewHeroIconLarge} />
            <Text style={styles.reviewHeroTitle}>
              {`Buy ${formattedAmount} of USDC`}
            </Text>
            {formattedPrice && (
              <Text style={styles.reviewHeroSubtitle}>
                {`vUSDC price ${formattedPrice}`}
              </Text>
            )}
          </View>

          {/* Receive summary - flat style */}
          <View style={styles.reviewSummaryFlat}>
            <View style={styles.reviewSummaryRowFlat}>
              <Text style={styles.reviewSummaryLabelFlat}>Receive</Text>
              <Text style={styles.reviewSummaryValueFlat}>{`${formattedReceived} USDC`}</Text>
            </View>
            <View style={styles.reviewSummaryRowFlat}>
              <Text style={styles.reviewSummaryLabelFlat}>Available in your wallet</Text>
              <Text style={styles.reviewSummaryValueFlatGreen}>1-5 minutes</Text>
            </View>
          </View>

          {/* Pay with row (flat style) */}
          <View
            style={styles.reviewPaymentRow}
          >
            {this.renderPaymentMethodIcon(selectedOption?.paymentMethod)}
            <View style={styles.reviewPaymentTextColumn}>
              <Text style={styles.reviewPaymentLabel}>Pay with</Text>
              <Text style={styles.reviewPaymentValue}>
                {paymentLabel || 'Select payment method'}
              </Text>
            </View>
          </View>

          {/* Disclosure */}
          <View style={styles.reviewDisclosure}>
            <Text style={styles.reviewDisclosureText}>
              {disclosureParagraphs[0]}
              {providerMeta.url ? (
                <>
                  {' '}
                  <Text
                    style={styles.reviewDisclosureLink}
                    onPress={() => this.handleProviderLearnMore(providerMeta)}
                  >
                    Learn more
                  </Text>
                  .
                </>
              ) : null}
            </Text>
            <Text style={[styles.reviewDisclosureText, { marginBottom: 0 }]}>
              {disclosureParagraphs[1]}
            </Text>
          </View>
        </ScrollView>

        <View style={styles.reviewFooter}>
          <View style={styles.reviewTotalContainer}>
            <Text style={styles.reviewTotalLabel}>{`${formattedAmount} total`}</Text>
            <View style={styles.feeBreakdown}>
              <Text style={styles.feeBreakdownText}>{`Network fee: ${formattedNetworkFeeAmount}`}</Text>
              <Text style={styles.feeBreakdownText}>{`Service fee: ${formattedServiceFeeAmount}`}</Text>
              {showBankFee ? (
                <Text style={styles.feeBreakdownText}>{`Bank fee: ${formattedBankFeeAmount}`}</Text>
              ) : null}
              <View style={styles.feeBreakdownDivider} />
              <Text style={styles.feeBreakdownTextBold}>{`Total fee: ${formattedTotalFeeAmount}`}</Text>
            </View>
          </View>
          {errorMessage ? (
            <View style={[styles.errorBanner, { marginBottom: 12 }]}>
              <Text style={styles.errorBannerText}>{errorMessage}</Text>
            </View>
          ) : null}
          <GradientButton
            onPress={this.startOnRamp}
            disabled={actionDisabled}
            style={styles.reviewActionWrapper}
            rightIcon={
              <MaterialCommunityIcons 
                name="open-in-new" 
                size={20} 
                color={'white'}
              />
            }
          >
            Buy now
          </GradientButton>
        </View>
      </View>
    );
  }

  // Fee range and limits display (derived from current options and amount)
  renderFeeAndLimits() {
    return null;
  }

  renderCountrySelector() {
    const countryData = this.state.taxCountry?.country ? ISO_3166_COUNTRIES[this.state.taxCountry.country] : null;

    if (this.state.loading) {
      return (
        <View style={styles.countryChipSkeleton} />
      );
    }
    
    return (
      <TouchableOpacity
        onPress={() => this.setState({ countryModalOpen: true })}
        style={styles.countryChip}
        activeOpacity={0.7}
      >
        <Text style={styles.countryChipText}>
          {countryData ? `${countryData.emoji} ${countryData.name}` : "Select country"}
        </Text>
        <Text style={styles.countryChipIcon}>⌄</Text>
      </TouchableOpacity>
    );
  }

  renderModals() {
    return (
      <Portal>
        {this.state.countryModalOpen && (
          <ListSelectionModal
            title="Select a Country"
            flexHeight={3}
            visible={this.state.countryModalOpen}
            showSearch={true}
            searchPlaceholder="Search countries"
            onSelect={(item) => this.handleChange(null, item.key)}
            data={ALLOWED_COUNTRIES.map((code) => {
              const item = ISO_3166_COUNTRIES[code];
              return {
                key: code,
                title: `${item.emoji} ${item.name}`,
              };
            })}
            cancel={() => this.setState({ countryModalOpen: false })}
          />
        )}
        
        {this.state.addressModalOpen && (
          <ListSelectionModal
            title={`Select a ${this.state.mainVerusNetwork} address`}
            flexHeight={3}
            visible={this.state.addressModalOpen}
            showSearch={true}
            searchPlaceholder="Search addresses"
            onSelect={(item) => {
              this.setState({
                chosenAddress: item.address,
                addressModalOpen: false
              });
            }}
            data={this.state.addresses.map((address) => ({
              key: address.id || address.address,
              title: address.name || address.address,
              address: address
            }))}
            cancel={() => this.setState({ addressModalOpen: false })}
          />
        )}
      </Portal>
    );
  }

  // Demo method for testing attestation flow - Remove in production
  demoAttestationFlow = () => {
    // Create mock transaction data
    const mockTransactionResult = {
      success: true,
      transactionId: "demo_12345"
    };

    // Create mock attestation data
    const mockAttestation = {
      data: "demo_mock_data", // Special flag for demo data
      signer: "VALU"
    };

    const transactionData = {
      amount: this.state.amount,
      currency: this.state.currency,
      received: this.state.converted,
      address: this.state.chosenAddress?.name || 'Your Wallet',
      provider: this.state.options[this.state.radioValue]?.provider || 'Payment Provider'
    };

    // Navigate to attestation acceptance screen
    this.navigateToAttestationAccept(mockAttestation, transactionData);
  };

  handleProviderLearnMore = (providerMeta) => {
    if (providerMeta?.url) Linking.openURL(providerMeta.url);
  };

  renderCongratsScreen = () => {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'white', paddingHorizontal: 32 }}>
        <MaterialCommunityIcons name="check-circle-outline" size={72} color={Colors.verusGreenColor} style={{ marginBottom: 24 }} />
        <Text style={{ fontSize: 26, fontWeight: '700', color: '#1A1A1A', marginBottom: 12, textAlign: 'center' }}>
          Purchase submitted!
        </Text>
        <Text style={{ fontSize: 15, color: '#666', textAlign: 'center', lineHeight: 22, marginBottom: 12 }}>
          Your USDC will arrive in your Ethereum wallet shortly.
        </Text>
        <Text style={{ fontSize: 15, color: '#666', textAlign: 'center', lineHeight: 22, marginBottom: 48 }}>
          Once it arrives, use the Convert screen to bridge it to the Verus network and receive vUSDC.
        </Text>
        <GradientButton
          onPress={this.resetToScreen}
          style={{ width: '100%' }}
        >
          Back to wallet
        </GradientButton>
      </View>
    );
  };

  render() {
    const { height, width } = Dimensions.get('window');
    const isSmall = height <= 667 || width <= 375;
    const ctaDisabled =
      this.state.loading ||
      this.state.error != null ||
      this.state.amount === "" ||
      this.state.radioValue === null ||
      this.state.updatingfee;
    const primaryButtonLabel = this.state.radioValue === null ? 'Select payment method' : 'Review order';
    const reviewVisible = this.state.reviewVisible;
    const errorMessage = this.state.error
      ? this.state.error.replace(/^ -\s*/, '')
      : null;
    const spinnerColor = this.state.updatingfee ? Colors.primaryColor : Colors.secondaryColor;
    const allBalances = this.props.allBalances;
    const vusdcId = 'i61cV2uicKSi1rSMQCBNQeSYC3UAi9GVzd';
    const addrId = this.state.chosenAddress?.id;
    const currentBal = addrId && allBalances[vusdcId] && allBalances[vusdcId][addrId] && allBalances[vusdcId][addrId].total
      ? Number(allBalances[vusdcId][addrId].total)
      : 0;
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: 'white' }}>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
          <View style={{ flex: 1 }}>
            {this.renderModals()}
            {this.renderPaymentMethodSheet()}

            {this.state.congratsVisible ? (
              this.renderCongratsScreen()
            ) : reviewVisible ? (
              this.renderReviewScreen(isSmall)
            ) : (
              <>
                {/* Main content container */}
                <View style={styles.modernContainer}>
                  {/* Header: minimal, right-aligned country chip only */}
                  <View style={[styles.header, { paddingBottom: 4 }]}>
                    <View style={{ flex: 1 }} />
                    {this.renderCountrySelector()}
                  </View>

                  {this.renderCurrencyInputs()}
                  {this.renderPaymentSelector()}

                  <View style={{ flex: 1 }} />

                  {/* Modern CTA Button */}
                  <View style={[styles.ctaContainer, isSmall ? { paddingBottom: 3 } : { paddingBottom: 6 } ]}>
                    {errorMessage ? (
                      <View style={styles.errorBanner}>
                        <Text style={styles.errorBannerText}>{errorMessage}</Text>
                      </View>
                    ) : (
                      <GradientButton
                        onPress={this.handleReviewPress}
                        disabled={ctaDisabled}
                        style={{ width: '100%' }}
                        leftIcon={
                          <View style={{ width: 24, alignItems: 'center' }}>
                            {this.state.updatingfee ? (
                              <ActivityIndicator color={'white'} size={16} />
                            ) : null}
                          </View>
                        }
                        rightIcon={<View style={{ width: 24 }} />}
                      >
                        {primaryButtonLabel}
                      </GradientButton>
                    )}
                  </View>
                </View>

                {/* Full-width keypad at bottom - outside main container */}
                <View style={[styles.fullWidthKeypadContainer, isSmall ? { paddingTop: 0, paddingBottom: Platform.OS === 'ios' ? 4 : 2 } : null]}>
                  <NumericKeypad
                    value={this.state.amount}
                    onChange={(val) => this.handleChange(val)}
                    decimalPlaces={2}
                    keyWidth={undefined}
                    keyHeight={isSmall ? 36 : 50}
                    fontSize={isSmall ? 22 : 28}
                    keyRadius={0}
                    keyBackground={'transparent'}
                    containerPaddingHorizontal={0}
                    rowSpacing={isSmall ? 2 : 4}
                  />
                </View>
              </>
            )}
          </View>
        </TouchableWithoutFeedback>
      </SafeAreaView>
    );
  }
}

const styles = StyleSheet.create({
  container: { 
    alignContent: 'center', 
    alignItems: 'center' 
  },
  modernContainer: {
    flex: 1,
    backgroundColor: 'white',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 8,
  },
  modernHeaderText: { 
    fontSize: 18, 
    fontWeight: '600',
    color: '#1A1A1A',
  },
  countryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#E6E6E6',
  },
  countryChipText: {
    fontSize: 12,
    color: '#333',
    marginRight: 4,
  },
  countryChipIcon: {
    fontSize: 12,
    color: '#888',
  },
  largeInputContainer: {
    backgroundColor: 'white',
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#F0F0F0',
  },
  largeAmountInput: {
    flex: 1,
    fontSize: 32,
    fontWeight: '600',
    color: '#1A1A1A',
    backgroundColor: 'transparent',
    paddingHorizontal: 0,
  },
  extraLargeAmountInput: {
    fontSize: 72,
    fontWeight: '700',
    color: '#1A1A1A',
    backgroundColor: 'transparent',
    paddingHorizontal: 0,
    paddingVertical: 0,
    textAlign: 'left',
    minWidth: 200,
  },
  extraLargeAmountInline: {
    fontSize: 72,
    fontWeight: '700',
    color: '#1A1A1A',
    backgroundColor: 'transparent',
    paddingHorizontal: 0,
    paddingVertical: 0,
    textAlign: 'left',
    includeFontPadding: false,
  },
  extraLargeAmountInlineSmall: {
    fontSize: 56,
  },
  currencyLabel: {
    fontSize: 18,
    fontWeight: '500',
    color: '#666',
    marginLeft: 12,
  },
  extraLargeCurrencyLabel: {
    fontSize: 72,
    fontWeight: '600',
    color: '#888',
    marginLeft: 16,
  },
  extraLargeCurrencyInline: {
    fontSize: 72,
    fontWeight: '500',
    color: '#888',
    includeFontPadding: false,
  },
  extraLargeCurrencyInlineSmall: {
    fontSize: 56,
  },
  smallInputContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.6)',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  smallAmountText: {
    fontSize: 18,
    fontWeight: '500',
    color: '#333',
  },
  smallCurrencyLabel: {
    fontSize: 14,
    fontWeight: '400',
    color: '#888',
  },
  ctaContainer: {
    paddingHorizontal: 20,
    paddingBottom: 0,
  },
  ctaActionWrapper: {
    borderRadius: 24,
    overflow: 'hidden',
    position: 'relative',
    width: '100%',
    alignSelf: 'stretch',
    height: 56,
  },
  ctaActionWrapperDisabled: {
    backgroundColor: '#CFEAF2',
  },
  ctaActionGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  ctaButtonContentContainer: {
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  ctaLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaSpinnerSlotLeft: {
    width: 24,
    marginRight: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaSpinnerSlotRight: {
    width: 24,
    marginLeft: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaLabelText: {
    marginTop: 0,
  },
  paymentSelectorContainer: {
    alignItems: 'center',
    marginTop: 12,
  },
  paymentSelectorSurface: {
    width: '90%',
  },
  paymentSelectorRowFlat: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  paymentMethodIconWrapper: {
    width: 32,
    height: 32,
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  paymentMethodImage: {
    width: 32,
    height: 16,
  },
  paymentSelectorTextColumn: {
    flex: 1,
    marginBottom: 2,
  },
  paymentSelectorFlatLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1A1A1A',
    marginBottom: 4,
  },
  paymentSelectorFlatValue: {
    fontSize: 16,
    fontWeight: '400',
    color: 'rgba(26, 26, 26, 0.7)',
  },
  paymentSelectorAmountRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  paymentSelectorAmountValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1A1A1A',
    marginRight: 6,
  },
  paymentSelectorTokenText: {
    fontSize: 16,
    fontWeight: '400',
    color: 'rgba(26, 26, 26, 0.7)',
  },
  paymentSelectorAmountSkeleton: {
    width: 64,
    height: 16,
    borderRadius: 6,
    backgroundColor: '#E8E8E8',
    marginRight: 6,
  },
  paymentSelectorLimitGroup: {
    marginRight: 8,
    alignItems: 'flex-end',
  },
  paymentSelectorLimitValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  paymentSelectorLimitLabel: {
    fontSize: 16,
    fontWeight: '400',
    color: 'rgba(26, 26, 26, 0.7)',
    marginTop: 2,
  },
  paymentSelectorVerticalLine: {
    alignSelf: 'flex-start',
    marginLeft: 28,
    width: 1,
    height: 18,
    backgroundColor: '#E6E6E6',
  },
  paymentSelectorUSDCIcon: {
    width: 24,
    height: 24,
    resizeMode: 'contain',
  },
  errorBanner: {
    backgroundColor: '#FFE8E6',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#FF6B6B',
  },
  errorBannerText: {
    color: '#B71C1C',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  reviewContainer: {
    flex: 1,
    backgroundColor: 'white',
  },
  reviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 12,
  },
  reviewHeaderTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  reviewScroll: {
    flex: 1,
    paddingHorizontal: 20,
  },
  reviewHero: {
    alignItems: 'center',
    marginTop: 24,
    marginBottom: 32,
  },
  reviewHeroIconLarge: {
    width: 32,
    height: 32,
    resizeMode: 'contain',
    marginBottom: 16,
  },
  reviewHeroTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1A1A1A',
    textAlign: 'center',
    marginBottom: 8,
  },
  reviewHeroSubtitle: {
    fontSize: 16,
    fontWeight: '400',
    color: 'rgba(26, 26, 26, 0.7)',
    textAlign: 'center',
  },
  reviewSummaryFlat: {
    marginBottom: 20,
  },
  reviewSummaryRowFlat: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: 'white',
  },
  reviewSummaryLabelFlat: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1A1A1A',
    flex: 1,
  },
  reviewSummaryValueFlat: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  reviewSummaryValueFlatGreen: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.verusGreenColor,
  },
  reviewPaymentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: 'white',
    marginBottom: 20,
  },
  reviewPaymentTextColumn: {
    flex: 1,
  },
  reviewPaymentLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1A1A1A',
    marginBottom: 4,
  },
  reviewPaymentValue: {
    fontSize: 16,
    fontWeight: '400',
    color: 'rgba(26, 26, 26, 0.7)',
  },
  reviewDisclosure: {
    padding: 0,
    marginBottom: 24,
  },
  reviewDisclosureText: {
    fontSize: 12,
    color: '#555',
    lineHeight: 18,
    marginBottom: 6,
  },
  reviewDisclosureLink: {
    color: '#555',
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  reviewFooter: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: '#E6E6E6',
    backgroundColor: 'white',
  },
  reviewTotalContainer: {
    marginBottom: 12,
  },
  reviewTotalLabel: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  reviewTotalSubLabel: {
    fontSize: 13,
    color: '#777',
    marginTop: 6,
    letterSpacing: -0.2,
  },
  feeBreakdown: {
    marginTop: 8,
    gap: 2,
  },
  feeBreakdownText: {
    fontSize: 12,
    color: '#777',
  },
  feeBreakdownTextBold: {
    fontSize: 12,
    color: '#1A1A1A',
    fontWeight: '600',
  },
  feeBreakdownDivider: {
    height: 1,
    backgroundColor: '#E6E6E6',
    marginVertical: 4,
    width: '50%',
    alignSelf: 'flex-start',
  },
  skeletonAmountWrapper: {
    height: 60,
    justifyContent: 'center',
  },
  skeletonBlockLarge: {
    height: 42,
    backgroundColor: '#E8E8E8',
    borderRadius: 8,
  },
  skeletonBlockLargeSmall: {
    height: 34,
  },
  skeletonIconPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#E8E8E8',
    marginRight: 12,
  },
  skeletonChevronPlaceholder: {
    width: 24,
    height: 24,
    marginLeft: 12,
    borderRadius: 12,
    backgroundColor: '#E8E8E8',
  },
  skeletonTextLine: {
    height: 16,
    backgroundColor: '#E8E8E8',
    borderRadius: 6,
    marginBottom: 6,
    width: '60%',
  },
  skeletonTextLineShort: {
    height: 14,
    backgroundColor: '#E8E8E8',
    borderRadius: 6,
    width: '40%',
  },
  countryChipSkeleton: {
    width: 140,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#E8E8E8',
  },
  reviewActionWrapper: {
    borderRadius: 28,
    overflow: 'hidden',
    position: 'relative',
    height: 56,
  },
  reviewActionWrapperDisabled: {
    backgroundColor: '#CFEAF2',
  },
  reviewActionGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  reviewButtonContentContainer: {
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modernActionButton: {
    borderRadius: 24,
    backgroundColor: 'transparent',
    // Remove any platform shadows
    elevation: 0,
    shadowColor: 'transparent',
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
  },
  modernActionButtonDisabled: {
    backgroundColor: 'transparent',
    elevation: 0,
    shadowColor: 'transparent',
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
  },
  modernActionButtonContent: {
    height: 56,
    justifyContent: 'center',
  },
  reviewActionButtonContent: {
    height: 56,
  },
  modernActionButtonLabel: {
    color: Colors.secondaryColor,
    fontWeight: '600',
    fontSize: 16,
    letterSpacing: 0,
    textTransform: 'none',
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  reviewActionButtonLabel: {
    fontSize: 18,
  },
  modernActionButtonLabelDisabled: {
    color: '#7DB8C9',
  },
  keypadContainer: {
    backgroundColor: '#FAFAFA',
    paddingTop: 16,
    paddingBottom: Platform.OS === 'ios' ? 34 : 16,
  },
  fullWidthKeypadContainer: {
    backgroundColor: 'white',
    paddingTop: 0,
    paddingBottom: Platform.OS === 'ios' ? 6 : 4,
    width: '100%',
    alignSelf: 'stretch',
  },
  optionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 4,
    backgroundColor: '#FAFAFA',
    borderRadius: 8,
  },
  optionsContainer: {
    width: '100%',
    paddingVertical: 4,
  },
  optionsScrollContainer: {
    width: '100%',
  },
  scrollIndicatorContainer: {
    position: 'absolute',
    bottom: 8,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
    pointerEvents: 'none',
  },
  scrollIndicatorArrow: {
    fontSize: 32,
    color: '#999',
    opacity: 0.6,
    textShadowColor: 'rgba(255, 255, 255, 0.8)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 4,
  },
  selectableOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 8,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E8E8E8',
    marginBottom: 2,
  },
  selectedOptionRow: {
    backgroundColor: '#E6F7FF',
    borderColor: Colors.primaryColor,
    borderWidth: 2,
  },
  optionContent: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginLeft: 8,
  },
  selectedOptionText: {
    fontWeight: '600',
    color: '#1A1A1A',
  },
  compactOptionRow: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 2,
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#E8E8E8',
    borderRadius: 6,
  },
  optionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 8,
  },
  optionRow3Column: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  feeRow: {
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  optionDivider: {
    height: 1,
    backgroundColor: '#E8E8E8',
    marginVertical: 4,
    marginHorizontal: 12,
  },
  optionMethod: {
    fontSize: 12,
    color: '#1A1A1A',
    fontWeight: '500',
    flex: 2,
  },
  optionReceive: {
    fontSize: 12,
    color: '#1A1A1A',
    fontWeight: '600',
    textAlign: 'right',
    flex: 1,
  },
  optionFee: {
    fontSize: 12,
    color: '#999',
    textAlign: 'center',
    flex: 1,
  },
  moreOptionsRow: {
    paddingVertical: 8,
    alignItems: 'center',
  },
  moreOptionsText: {
    fontSize: 12,
    color: '#888',
    fontStyle: 'italic',
  },
  skeletonOptionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 4,
    backgroundColor: '#FAFAFA',
    borderRadius: 8,
  },
  skeletonOptionsContainer: {
    width: '90%',
    paddingVertical: 4,
  },
  skeletonCompactOptionRow: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 2,
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#E8E8E8',
    borderRadius: 6,
  },
  skeletonOptionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 8,
  },
  skeletonFeeRow: {
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  skeletonRow3Column: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  skeletonText: {
    height: 14,
    backgroundColor: '#E8E8E8',
    borderRadius: 4,
    width: '80%',
  },
  headerText: { 
    fontSize: 18, 
    textAlign: 'center', 
    paddingVertical: 5, 
    fontWeight: 'bold' 
  },
  textInput: {
    paddingHorizontal: 10,
    width: 300,
    alignSelf: 'center',
    backgroundColor: "#eeeeee",
    fontSize: 18,
  },
  loadingIndicator: {
    width: 200, 
    height: 200, 
    flex: 1,
    alignSelf: 'center',
    justifyContent: 'center',
    alignItems: 'center'
  },
  tableRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#ccc',
  },
  tableCell: {
    flex: 1,
  },
  tableHeaderCell: {
    fontWeight: "bold", 
    textAlign: "left"
  },
  tableCellLabel: { 
    fontSize: 12, 
    color: '#888', 
    textAlign: "left" 
  },
  tableCellValue: { 
    fontSize: 14, 
    textAlign: "left" 
  },
  buttonLabel: { 
    fontWeight: 'bold', 
    fontSize: 16 
  },
  actionButton: { 
    height: 41, 
    marginTop: 6, 
    width: 180 
  },
  countrySelector: {
    width: 200,
    height: 50,
    borderWidth: 1,
    borderColor: 'grey',
    borderRadius: 5,
    padding: 5
  }
});

const mapStateToProps = (state) => ({
  activeAccount: state.authentication.activeAccount,
  encryptedPersonalData: state.personal,
  allSubWallets: state.coinMenus.allSubWallets,
  valuService: state.channelStore_valu_service,
  allBalances: state.ledger.balances,
  generalWalletSettings: state.settings.generalWalletSettings,
});

export default connect(mapStateToProps)(ValuOnRampChooseSource);
