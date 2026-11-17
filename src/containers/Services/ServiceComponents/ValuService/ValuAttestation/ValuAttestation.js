/*
  ValuAttestation (Timeline UI with persistent CTA)
  - Always-visible 4-step timeline: Purchase → Choose/Link VerusID → Verify → Proof issued
  - Replaced conditional content blocks with a compact TimelineList while preserving logic
  - Kept large gradient header and primary CTA (48px) with caption "Step X of 4 · <action>"
  - Moved "What you get" benefits into the initial (Purchase) step expanded area
  - Maintains all existing alerts, SumSub/InAppBrowser flows, and notifications
  - Added wait reminder copy to provisioning notification message
*/
import React, { useEffect, useState, useCallback, useRef, useLayoutEffect } from "react"
import { connect, useSelector } from 'react-redux'
import { useFocusEffect } from '@react-navigation/native';
import { CommonActions } from '@react-navigation/native';
import InAppBrowser from 'react-native-inappbrowser-reborn';
import { primitives, VerusIdInterface } from "verusid-ts-client"
import { SafeAreaView, ScrollView, View, Linking, AppState, Dimensions, TouchableOpacity, Animated, Platform } from 'react-native'

import { Divider, List, Button, Text, Portal, Dialog } from 'react-native-paper';
import ListSelectionModal from "../../../../../components/ListSelectionModal/ListSelectionModal";
import { requestServiceStoredData } from "../../../../../utils/auth/authBox";
import { VERUSID_SERVICE_ID } from "../../../../../utils/constants/services";
import { CoinDirectory } from "../../../../../utils/CoinData/CoinDirectory";
import { openLinkIdentityModal } from "../../../../../actions/actions/sendModal/dispatchers/sendModal";
import { useObjectSelector } from "../../../../../hooks/useObjectSelector";
import Styles from "../../../../../styles";
import Colors from '../../../../../globals/colors';
import { VUSDC } from "../../../../../images/customIcons";
import { requestAttestationData, requestSeeds } from "../../../../../utils/auth/authBox";
import { ATTESTATIONS_PROVISIONED } from "../../../../../utils/constants/attestations";
import { signIdProvisioningRequest } from '../../../../../utils/api/channels/vrpc/requests/signIdProvisioningRequest';
import { NavigationNotification, LoadingNotification } from '../../../../../utils/notification';
import { dispatchAddNotification } from '../../../../../actions/actions/notifications/dispatchers/notifications';
import { NOTIFICATION_ICON_VALU, NOTIFICATION_TYPE_NAVIGATION, NOTIFICATION_ICON_VERUSID } from '../../../../../utils/constants/notifications';
import { createAlert, resolveAlert } from '../../../../../actions/actions/alert/dispatchers/alert';
import { updateDeeplinkUrl } from '../../../../../actions/actionDispatchers';
import {
    VALU_POL_PAYMENT_PENDING, VALU_POL_PAYMENT_RECEIVED, VALU_POL_PAYMENT_STARTED, VALU_POL_PAYMENT_FAILED,
    VALU_POL_IDENTITY_PROVISIONED_PENDING, VALU_POL_IDENTITY_PROVISIONED, VALU_POL_READY, NOTIFICATION_TYPE_VERUSID_PENDING,
    VALU_POL_PENDING, NOTIFICATION_TYPE_VERUSID_READY, POP_RECEIVED, VALU_POL_IDENTITY_CONFIRMED
} from '../../../../../utils/constants/services';
import AnimatedActivityIndicator from "../../../../../components/AnimatedActivityIndicator";
import ValuProvider from "../../../../../utils/services/ValuProvider";
import { VALU_SERVICE_ID, ATTESTATION_SERVICE_ID } from "../../../../../utils/constants/services";
import { VALU_SERVICE } from "../../../../../utils/constants/intervalConstants";
import { setServiceLoading } from "../../../../../actions/actionCreators";
import { updatePendingVerusIds } from "../../../../../actions/actions/channels/verusid/dispatchers/VerusidWalletReduxManager"
import { setRequestedVerusId, linkVerusId, deleteProvisionedIds } from '../../../../../actions/actions/services/dispatchers/verusid/verusid';
import { getInfo } from "../../../../../utils/api/channels/vrpc/callCreators";
import { getIdentity } from "../../../../../utils/api/channels/verusid/callCreators";
import { Buffer } from 'buffer';
import { requestPrivKey } from "../../../../../utils/auth/authBox";
import { VRPC } from "../../../../../utils/constants/intervalConstants";
import { sha256 } from "@bitgo/utxo-lib/dist/src/crypto";
import { dispatchRemoveNotification } from '../../../../../actions/actions/notifications/dispatchers/notifications';
import Svg, { Defs, LinearGradient as SvgLinearGradient, Stop, Text as SvgText, TSpan } from 'react-native-svg';
import SemiModal from '../../../../../components/SemiModal';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { set } from "lodash";
import TimelineList from '../../../../../components/Timeline/TimelineList';
import GradientButton from "../../../../../components/GradientButton";
import AppleIAPManager from "../../../../../utils/iap/AppleIAPManager";


const ValuAttestation = (props) => {
    const activeAccount = useSelector(state => state.authentication.activeAccount);
    const signedIn = useSelector(state => state.authentication.signedIn);
    const verusNetwork = Object.keys(activeAccount.testnetOverrides).length > 0 ? 'VRSCTEST' : 'VRSC';
    const [valuReply, setValuReply] = useState(null);
    const [loading, setLoading] = useState(true); // Start with loading true
    const [status, setStatus] = useState(null); // Start with null instead of empty string
    const [mainButtonText, setMainButtonText] = useState("Get Proof for $9.99");
    // Backend switch: when the server reports payment is not required, the purchase step is skipped
    const [paymentRequired, setPaymentRequired] = useState(true);
    const [appState, setAppState] = useState(AppState.currentState);
    const [identityChoiceModalVisible, setIdentityChoiceModalVisible] = useState(false);
    const [existingIdentityModalVisible, setExistingIdentityModalVisible] = useState(false);
    const [linkedIds, setLinkedIds] = useState({});
    const [sortedIds, setSortedIds] = useState({});
    const [isProvisioningIdentity, setIsProvisioningIdentity] = useState(false);
    const [showIdentityProvisioningProgress, setShowIdentityProvisioningProgress] = useState(false);
    const [showPendingIdentityModal, setShowPendingIdentityModal] = useState(false);
    const [pendingIdentityInfo, setPendingIdentityInfo] = useState(null);
    const [howItWorksVisible, setHowItWorksVisible] = useState(false);
    const pulse = useRef(new Animated.Value(1)).current;
    const acchash = useSelector(state =>
        state.authentication.activeAccount
    ).accountHash;
    const systemId = Object.keys(activeAccount.testnetOverrides).length > 0 ? 'iJhCezBExJHvtyH3fGhNnt2NhU4Ztkf2yq' : 'i5w5MuNik5NtLcYmNzcvaoixooEebB6MGV';
    const notifications = useSelector(state =>
        state.notifications
    );
    const encryptedIds = useObjectSelector(state => state.services.stored[VERUSID_SERVICE_ID]);
    const pendingIds = useSelector(state => state.channelStore_verusid.pendingIds);

    useLayoutEffect(() => {
        props.navigation.setOptions({
            headerTitle: '',
            headerRight: () => null,
            headerBackTitle: 'Back',
            headerShadowVisible: false,
            headerStyle: {
                backgroundColor: 'white',
                elevation: 0,
                shadowOpacity: 0,
            },
        });
    }, [props.navigation]);

    // While registering identity, hide back button and disable gestures to avoid leaving mid-flow
    useEffect(() => {
        if (props.navigation?.setOptions) {
            props.navigation.setOptions({
                headerLeft: showIdentityProvisioningProgress ? () => null : undefined,
                gestureEnabled: !showIdentityProvisioningProgress,
            });
        }
    }, [showIdentityProvisioningProgress]);

    const buttonMessages = {
        [VALU_POL_PAYMENT_STARTED]: "Get Proof for $9.99",
        [VALU_POL_PAYMENT_PENDING]: "RESUME",
        [VALU_POL_PAYMENT_RECEIVED]: "CONTINUE",
        [VALU_POL_PAYMENT_FAILED]: "RETRY",
        [VALU_POL_READY]: "CONTINUE",
        [VALU_POL_IDENTITY_PROVISIONED_PENDING]: "WAIT FOR IDENTITY",
        [VALU_POL_IDENTITY_PROVISIONED]: "CONTINUE",
        [VALU_POL_PENDING]: "CONTINUE",
        [VALU_POL_IDENTITY_CONFIRMED]: "CONTINUE",
        [POP_RECEIVED]: "View my Proof of Personhood",

    }

    // Navigation reset function similar to DeepLink.js
    const resetToHome = () => {
        let resetAction

        if (signedIn) {
            resetAction = CommonActions.reset({
                index: 0,
                routes: [{ name: 'SignedInStack' }],
            });
        } else {
            resetAction = CommonActions.reset({
                index: 0,
                routes: [{ name: 'SignedOutStack' }],
            });
        }
        props.navigation.dispatch(resetAction);
    }

    // Shared function for new identity provisioning
    const provisionNewIdentity = async (identityName, source = 'identity request') => {
        setIsProvisioningIdentity(true);
        setShowIdentityProvisioningProgress(true);
        try {
            console.log(`Provisioning new identity from ${source}:`, identityName);

            const valuDeepLink = await ValuProvider.getValuIdDeepLink({ identityName, isNew: true });
            if (valuDeepLink.success === false) {
                throw new Error(valuDeepLink.error);
            }

            const loginRequest = primitives.LoginConsentRequest.fromWalletDeeplinkUri(valuDeepLink.data);

            const provisionRequest = new primitives.LoginConsentProvisioningRequest({
                signing_address: activeAccount.keys[verusNetwork].vrpc.addresses[0],
                challenge: new primitives.LoginConsentProvisioningChallenge({
                    challenge_id: loginRequest.challenge.challenge_id,
                    created_at: Number((Date.now() / 1000).toFixed(0)),
                    name: identityName,
                    system_id: loginRequest.system_id,
                    parent: "iQ2TqQot9W7mLrcCRJKnAZmaPTTY6sx4S4" //TODO: change to a variable
                }),
            });

            const signedRequest = await signIdProvisioningRequest(CoinDirectory.findCoinObj(verusNetwork), provisionRequest);

            const valuProvisioningResponse = await ValuProvider.provisionIdentityRequest(signedRequest);

            if (valuProvisioningResponse?.error) {
                throw new Error(valuProvisioningResponse.error);
            }

            const response = new primitives.LoginConsentProvisioningResponse(valuProvisioningResponse);

            const { decision } = response;
            const { result } = decision;

            const identityAddress = result?.identity_address;
            const url = result.info_uri;

            const newLoadingNotification = new LoadingNotification();
            newLoadingNotification.body = "";
            let formattedName = identityName;
            const lastDotIndex = identityName.lastIndexOf('.');
            if (lastDotIndex !== -1) {
                formattedName = identityName.substring(0, lastDotIndex);
            }
            await handleProvisioningResponse(newLoadingNotification.uid, formattedName, identityAddress, url, loginRequest, identityName);


            newLoadingNotification.title = [identityName, ' is being provisioned by ', 'Valuid@', '. Please wait a moment.'];
            newLoadingNotification.acchash = activeAccount.accountHash;
            newLoadingNotification.icon = NOTIFICATION_ICON_VERUSID;

            dispatchAddNotification(newLoadingNotification);
            setShowIdentityProvisioningProgress(false);
            setIsProvisioningIdentity(false);

            // Instead of navigating home, return the identity info to continue the attestation process
            return { identityName, identityAddress, continueFlow: true };

        } catch (error) {
            console.error(`Error provisioning identity from ${source}:`, error);
            setShowIdentityProvisioningProgress(false);
            setIsProvisioningIdentity(false);
            createAlert(
                'Identity Registration Failed',
                'An error occurred while setting up your identity. ' + error.message,
                [
                    {
                        text: 'OK',
                        onPress: () => {
                            resolveAlert();
                            resetToHome();
                        }
                    }
                ],
                { cancelable: false }
            );
            throw error;
        }
    };

    // Navigate to Attestations list (robust across nested navigators)
    const navigateToAttestations = () => {
        const parentNav = props.navigation?.getParent?.() || null;
        if (parentNav) {
            parentNav.navigate('ServicesHome', {
                screen: 'Service',
                params: { service: ATTESTATION_SERVICE_ID },
            });
            return;
        }

        // Fallbacks if not inside ServicesHome parent
        if (props.navigation?.replace) {
            props.navigation.replace('Service', { service: ATTESTATION_SERVICE_ID });
        } else {
            props.navigation.navigate('Service', { service: ATTESTATION_SERVICE_ID });
        }
    }

    // New function to continue with proof of personhood
    const continueProofOfPersonhood = async (identityInfo) => {
        try {
            setLoading(true);

            // Get the SumSub session: the server returns the page URL and a one-time
            // challenge whose message the wallet must sign (single use, 10 minutes)
            const urlReply = await ValuProvider.startSumsubSession(identityInfo ? {
                identityName: identityInfo.identityName,
                isNew: !identityInfo.isExisting
            } : {});

            if (urlReply.success === false) {
                throw new Error(urlReply.error);
            }

            const { url: sumsubUrl, challengeId, message } = urlReply.data || {};
            if (!sumsubUrl || !challengeId || !message) {
                throw new Error("The Valu server did not return a KYC session. Please try again later.");
            }

            // Create signature for authentication
            const coinObj = CoinDirectory.findCoinObj(systemId, null, true);

            const chainInfo = await getInfo(systemId);
            const height = chainInfo.result.longestchain;
            const messageHash = sha256(Buffer.from(message, 'utf-8'));

            // Sign the message using the identity address
            const RAddress = activeAccount.keys[verusNetwork].vrpc.addresses[0];
            const wif = await requestPrivKey(coinObj.id, VRPC);

            const signature = await VerusIdInterface.signHashWithAddress(messageHash, wif);

            // Validate all required parameters are present
            if (!signature || !message || !challengeId || !RAddress || !height || !coinObj?.system_id) {
                const missingParams = [];
                if (!signature) missingParams.push('signature');
                if (!message) missingParams.push('message');
                if (!challengeId) missingParams.push('challenge');
                if (!RAddress) missingParams.push('RAddress');
                if (!height) missingParams.push('height');
                if (!coinObj?.system_id) missingParams.push('systemId');
                
                console.error("Missing authentication parameters:", missingParams);
                throw new Error(`Failed to get signature. Missing required parameters: ${missingParams.join(', ')}. Please try again later.`);
            }

            // Append signature and related data to URL as query parameters
            // (URLSearchParams URL-encodes every value)
            const url = new URL(sumsubUrl);
            url.searchParams.append('signature', signature);
            url.searchParams.append('message', message);
            url.searchParams.append('challenge', challengeId);
            url.searchParams.append('RAddress', RAddress);
            url.searchParams.append('height', height.toString());
            url.searchParams.append('systemId', coinObj.system_id);

            const authenticatedUrl = url.toString();

            // Open the SumSub URL in InAppBrowser
            await InAppBrowser.close();
            if (Platform.OS === 'android' && await InAppBrowser.isAvailable()) {
                const browserResult = await InAppBrowser.open(authenticatedUrl, {
                    // iOS Properties
                    dismissButtonStyle: 'close',
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
                    hasBackButton: false,
                    waitForRedirectDelay: 500,
                    showInRecents: true,
                    ephemeralWebSession: false,
                    animations: {
                        startEnter: 'slide_in_right',
                        startExit: 'slide_out_left',
                        endEnter: 'slide_in_left',
                        endExit: 'slide_out_right'
                    }
                });

                // Handle the browser close result
                if (browserResult.type === 'cancel' || browserResult.type === 'dismiss') {
                    setLoading(true);
                    await fetchData();
                } else {
                    // Browser was closed due to navigation/completion
                    setLoading(true);
                    await fetchData();
                }
            } else {
                Linking.openURL(authenticatedUrl);
                setLoading(false);
            }

            // Don't set loading false here since we handle it in the browser result

        } catch (error) {
            console.error("Error continuing proof of personhood:", error);
            setLoading(false);
            createAlertDialog(
                'An error occurred while continuing with your proof of personhood. ' + error.message, "OK"
            );
        }
    };

    const handleProvisioningResponse = async (
        notificationUid,
        identityName,
        identityID,
        uri,
        loginRequest,
        fqn
    ) => {

        const verusIdState = {
            status: NOTIFICATION_TYPE_VERUSID_PENDING,
            fqn: fqn,
            loginRequest: loginRequest.toBuffer().toString('base64'),
            fromService: false,
            createdAt: Number((Date.now() / 1000).toFixed(0)),
            infoUri: uri,
            provisioningName: identityName,
            notificationUid: notificationUid
        }

        await setRequestedVerusId(identityID, verusIdState, CoinDirectory.findCoinObj(verusNetwork).id);
        await updatePendingVerusIds();

    };

    const fetchData = useCallback(async () => {
 
        if (!loading) {
            setLoading(true);
        }
        // Don't fetch data if we're currently provisioning an identity
        if (isProvisioningIdentity) {
            setLoading(false);
            return;
        }

        // Check for data in the wallet that says there is an attestation present.
        let attestaionPresent = false
        try {
            const attestations = await requestAttestationData(ATTESTATIONS_PROVISIONED);
            // Check if user has "Valu Proof of Personhood" attestation
            attestaionPresent = Object.values(attestations || {}).some(attestationItem =>
                attestationItem &&
                typeof attestationItem === 'object' &&
                attestationItem.name === "Valu Proof of Personhood"
            );


        } catch (e) {
            console.log("Error checking for existing Proof of Personhood:", e);

        }

        if (attestaionPresent) {
            // Use the navigation object
            setStatus(POP_RECEIVED);
            setLoading(false);
            return;
        }

        try {

            // Signs a server-issued challenge (POST /auth/challenge) with the wallet's R-address
            const { reply, request: signedStatusRequest } = await ValuProvider.checkAttestationStatus();

            if (reply.success === false) {
                throw new Error(reply.error);
            }
            let POLStatus = reply.data.status;
            const flag = reply.data.paymentRequired ?? reply.data.payment_required;
            const isPaymentRequired = !(flag === false || flag === 0 || flag === 'false');
            setPaymentRequired(isPaymentRequired);

            if (!isPaymentRequired && [VALU_POL_PAYMENT_STARTED, VALU_POL_PAYMENT_PENDING, VALU_POL_PAYMENT_FAILED].includes(POLStatus)) {
                POLStatus = VALU_POL_PAYMENT_RECEIVED;
            }

            setMainButtonText(buttonMessages[POLStatus]);
            setValuReply(reply);
            setStatus(POLStatus);

            if (POLStatus === VALU_POL_PAYMENT_FAILED) {
                createAlertDialog(
                    `Your previous payment attempt failed, would you like to try again?`, "RETRY", () => {
                        ValuProvider.retryAttestationPayment({ request: signedStatusRequest }).then((innerreply) => {
                            setValuReply(innerreply);
                            setStatus(POLStatus);
                            Linking.openURL(innerreply.data.url)
                        });
                    })
            } else if (POLStatus === VALU_POL_PAYMENT_RECEIVED) {
                // maybe add notification.
            }
            setLoading(false);

        } catch (e) {
            console.log("Error from check status of POL: ", e.message ? e.message : e)
            setLoading(false);
            setStatus("error");
            setMainButtonText("RETRY");
            createAlertDialog(
                `An error occurred while trying to start the Valu Proof of Personhood process. ${e.message}`, "RETRY")
        }

    }, [props.navigation, isProvisioningIdentity, loading]);

    // useFocusEffect(fetchData);

    useEffect(() => {
        // skeleton pulse animation
        Animated.loop(
            Animated.sequence([
                Animated.timing(pulse, { toValue: 0.6, duration: 700, useNativeDriver: true }),
                Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true })
            ])
        ).start();
        fetchData();

    }, []);

    // Cleanup Apple IAP when component unmounts (iOS only)
    useEffect(() => {
        return () => {
            if (Platform.OS === 'ios') {
                AppleIAPManager.cleanup().catch(err => {
                    console.log('Error cleaning up Apple IAP:', err);
                });
            }
        };
    }, []);

    // Reload linked identities when encrypted IDs change
    useEffect(() => {
        if (encryptedIds) {
            loadLinkedIdentities();
        }
    }, [encryptedIds]);

    // Handle navigation from ValuChooseIdentity screen
    useFocusEffect(
        useCallback(() => {
            const routeParams = props.route?.params;
            if (routeParams?.continueFlow && routeParams?.chosenIdentity) {
                // Continue with the deep link flow using the chosen identity
                continueWithIdentity(routeParams.chosenIdentity);
                // Clear the params to avoid re-execution
                props.navigation.setParams({ continueFlow: false, chosenIdentity: null });
                // Fallback if no parent navigator
                props.navigation.reset({
                    index: 0,
                    routes: [{ name: 'SignedInStack' }]
                });

            }
        }, [props.route?.params])
    );

    const continueWithIdentity = async (chosenIdentity) => {
        try {
            const result = await provisionNewIdentity(chosenIdentity, 'ValuChooseIdentity screen');
            if (result?.continueFlow) {
                // Continue with proof of personhood after identity provisioning
                await continueProofOfPersonhood(result);
            }
        } catch (error) {
            console.error('Error in continueWithIdentity:', error);
        }
    };

    // Load existing identities from VerusID service
    const loadLinkedIdentities = async () => {
        try {
            const verusIdServiceData = await requestServiceStoredData(VERUSID_SERVICE_ID);

            if (verusIdServiceData.linked_ids) {
                setLinkedIds(verusIdServiceData.linked_ids);

                // Sort identities like in LoginRequestIdentity
                const sortedIdKeysPerChain = {};
                const chainIds = Object.keys(verusIdServiceData.linked_ids);

                for (const chainId of chainIds) {
                    sortedIdKeysPerChain[chainId] = verusIdServiceData.linked_ids[chainId]
                        ? Object.keys(verusIdServiceData.linked_ids[chainId]).sort(function (x, y) {
                            if (verusIdServiceData.linked_ids[chainId][x] < verusIdServiceData.linked_ids[chainId][y]) {
                                return -1;
                            }
                            if (verusIdServiceData.linked_ids[chainId][x] > verusIdServiceData.linked_ids[chainId][y]) {
                                return 1;
                            }
                            return 0;
                        })
                        : [];
                }
                setSortedIds(sortedIdKeysPerChain);
            } else {
                setLinkedIds({});
                setSortedIds({});
            }
        } catch (e) {
            console.error('Error Loading Linked VerusIDs:', e.message);
            setLinkedIds({});
            setSortedIds({});
        }
    };


    // Handle selection of existing identity
    const selectExistingIdentity = async (iAddress) => {
        setExistingIdentityModalVisible(false);
        setLoading(true);
        try {
            const identityName = linkedIds[verusNetwork] && linkedIds[verusNetwork][iAddress];
            if (!identityName) {
                throw new Error("Identity name not found");
            }

            // Continue with proof of personhood using existing identity
            await continueProofOfPersonhood({ identityName, identityAddress: iAddress, isExisting: true });

        } catch (error) {
            console.error("Error using existing identity:", error);
            setLoading(false);
            createAlertDialog(
                'An error occurred while using your existing identity. ' + error.message, "OK"
            );
        }
    };

    // Handle requesting a new identity (ValuChooseIdentity flow)
    const handleNewIdentityRequest = async (identityName) => {
        try {
            const result = await provisionNewIdentity(identityName, 'new identity request');
            if (result?.continueFlow) {
                // Continue with proof of personhood after identity provisioning
                await continueProofOfPersonhood(result);
            }
        } catch (error) {
            console.error('Error in handleNewIdentityRequest:', error);
        }
    };

    // Handle linking new identity
    const openLinkIdentityModalFromChain = () => {
        setExistingIdentityModalVisible(false);
        return openLinkIdentityModal(CoinDirectory.findCoinObj(verusNetwork, null, true));
    };

    // Show identity choice modal
    const showIdentityChoiceModal = async () => {
        await loadLinkedIdentities();
        setIdentityChoiceModalVisible(true);
    };


    // Continue with new ValuID flow
    const continueWithNewValuId = async () => {
        setIdentityChoiceModalVisible(false);
        await new Promise(resolve => setTimeout(resolve, 200)); // Small delay to ensure modal is closed before navigating
        // Navigate to ValuChooseIdentity screen with returnScreen param
        const parentNav = props.navigation?.getParent();
        if (parentNav) {
            parentNav.navigate('ServicesHome', {
                screen: 'ValuChooseIdentity',
                params: {
                    returnScreen: 'ValuAttestation',
                    onIdentitySubmit: handleNewIdentityRequest
                }
            });
        }
    };

    // Show existing identity selection modal
    const showExistingIdentityModal = () => {
        setIdentityChoiceModalVisible(false);
        setExistingIdentityModalVisible(true);
    };

    // Check for pending identities and handle accordingly
    const checkForPendingIdentity = async () => {
        try {

            if (pendingIds[verusNetwork]) {
                const identityAddresses = Object.keys(pendingIds[verusNetwork] || {});
                if (identityAddresses.length > 0) {
                    // Get the first pending identity (you might want to handle multiple differently)
                    const firstAddress = identityAddresses[0];
                    const identityDetails = pendingIds[verusNetwork][firstAddress];

                    // Check if the identity has been mined in using getidentity
                    try {
                        const identityResult = await getIdentity(systemId, firstAddress);

                        if (identityResult && identityResult.result && identityResult.result.identity) {
                            // Identity is mined in, automatically link it and remove notification
                            const identityName = identityDetails.fqn || identityDetails.provisioningName || 'Unknown';

                            // Link the VerusID
                            await linkVerusId(firstAddress, identityName, verusNetwork);

                            // Delete from pending IDs
                            await deleteProvisionedIds(firstAddress, verusNetwork);

                            // Update pending IDs in Redux store
                            await updatePendingVerusIds();

                            // Remove notification if it exists
                            if (identityDetails.notificationUid) {
                                await dispatchRemoveNotification(identityDetails.notificationUid);
                            }

                            return 'auto_linked'; // Identity was automatically linked
                        }
                    } catch (getIdentityError) {
                        console.log('Error checking identity status with getidentity:', getIdentityError);
                        // Continue with normal flow if getidentity fails
                    }

                    if (identityDetails.status === NOTIFICATION_TYPE_VERUSID_READY) {
                        // Identity is ready to be linked
                        setPendingIdentityInfo({
                            address: firstAddress,
                            details: identityDetails
                        });
                        setShowPendingIdentityModal(true);
                        return 'ready'; // Found ready identity
                    } else if (identityDetails.status === NOTIFICATION_TYPE_VERUSID_PENDING) {
                        // Identity is still being processed
                        const identityName = identityDetails.fqn || identityDetails.provisioningName || 'Unknown';
                        createAlertDialog(
                            `You have a pending ID "${identityName}" please wait a few more minutes for this to be confirmed then you can link, try again in a few minutes.`,
                            "OK"
                        );
                        return 'pending'; // Found pending identity
                    }
                }
            }
            return false; // No pending identity found
        } catch (error) {
            console.log('Error checking for pending identity:', error);
            return false;
        }
    };

    // Link the pending identity
    const linkPendingIdentity = async () => {
        if (!pendingIdentityInfo) return;

        try {
            setLoading(true);

            const { address, details } = pendingIdentityInfo;
            const identityName = details.provisioningName || details.fqn;

            // Link the VerusID
            await linkVerusId(address, identityName, verusNetwork);

            // Delete from pending IDs
            await deleteProvisionedIds(address, verusNetwork);

            // Update pending IDs in Redux store
            await updatePendingVerusIds();

            // Remove notification if it exists
            if (details.notificationUid) {
                await dispatchRemoveNotification(details.notificationUid);
            }

            // Close the modal and show success message
            setShowPendingIdentityModal(false);
            setPendingIdentityInfo(null);

            createAlertDialog(
                `Successfully linked identity: ${identityName}. Now proceeding to get your Valu Attestation.`,
                "CONTINUE",
                async () => {
                    try {
                        // Now proceed with the attestation flow
                        const newRep = await ValuProvider.getValuAttestationStatus();
                        if (newRep.success === false) {
                            throw new Error(newRep.error);
                        }
                        // Trigger internal deeplink handler instead of opening externally
                        updateDeeplinkUrl(newRep.data);
                    } catch (error) {
                        console.log('Error proceeding with attestation:', error);
                        createAlertDialog(
                            `Failed to proceed with attestation: ${error.message}`,
                            "OK"
                        );
                    }
                }
            );

        } catch (error) {
            console.log('Error linking pending identity:', error);
            createAlertDialog(
                `Failed to link identity: ${error.message}`,
                "OK"
            );
        } finally {
            setLoading(false);
        }
    };

    const checkAccountCreationStatus = async () => {

        // Make sure the wallet login has run for this network
        await ValuProvider.authenticate();
        try {
            const authResult = await ValuProvider.authenticateRegisteredUser();

            // If authentication is successful, user is already authenticated
            if (authResult.success) {

                return;
            }
        } catch (error) {
            console.log("Registered user authentication failed:", error?.message ? error.message : error);
        }
    }

    useEffect(() => {
        // make sure teh screen reloads when the app is brought back to the foreground
        const handleAppStateChange = (nextAppState) => {
            if (appState.match(/inactive|background/) && nextAppState === 'active') {
                setLoading(true);
                fetchData();
            }
            setAppState(nextAppState);
        };

        const subscription = AppState.addEventListener('change', handleAppStateChange);

        return () => {
            subscription.remove();
        };
    }, [appState, fetchData]);

    const createAlertDialog = (message, button, func = () => { }) => {
        createAlert(
            `Valu Proof of Personhood Attestation`,
            message, [
            {
                text: 'CANCEL',
                onPress: () => resolveAlert(false),
                style: 'cancel',
            },
            {
                text: button, onPress: () => {
                    func();
                    resolveAlert(true);
                }
            },
        ],
            { cancelable: false }
        );
    }

    const startOnRamp = async () => {

        try {
            setLoading(true);
            if (status === VALU_POL_PAYMENT_STARTED) {

                const { directory } = notifications;
                let skipDispatchNotification = false;
                const keys = Object.keys(directory || {});
                keys.forEach((uid, index) => {
                    if (directory[uid].acchash === acchash && directory[uid].type === NOTIFICATION_TYPE_NAVIGATION) {
                        skipDispatchNotification = true;
                    }
                });

                // Use Apple In-App Purchase for iOS, external payment URL for Android
                if (Platform.OS === 'ios') {
                    try {
                        // Complete the IAP purchase flow
                        const purchaseResult = await AppleIAPManager.completePurchaseFlow();
                        
                        console.log('iOS IAP purchase successful:', purchaseResult);
                        
                        // Payment successful, refresh status to proceed to next step
                        await fetchData();
                        setLoading(false);
                        
                        // Show success notification
                        if (!skipDispatchNotification) {
                            const newLoadingNotification = new NavigationNotification();
                            newLoadingNotification.body = "Continue";
                            newLoadingNotification.title = [`Complete Valu Proof of Personhood`];
                            newLoadingNotification.acchash = activeAccount.accountHash;
                            newLoadingNotification.icon = NOTIFICATION_ICON_VALU;
                            newLoadingNotification.navigate = () => {
                                props.navigation.navigate('ServicesHome', {
                                    screen: 'ValuAttestation',
                                });
                            };
                            dispatchAddNotification(newLoadingNotification);
                        }
                        
                        return;
                    } catch (iapError) {
                        console.error('iOS IAP error:', iapError);
                        setLoading(false);
                        
                        // Handle user cancellation gracefully
                        if (iapError.code === 'E_USER_CANCELLED' || 
                            iapError.message?.includes('cancelled') ||
                            iapError.message?.includes('canceled')) {
                            // User cancelled, no need to show error
                            return;
                        }
                        
                        createAlertDialog(
                            `Payment failed: ${iapError.message || 'Unknown error'}. Please try again.`,
                            "RETRY"
                        );
                        return;
                    }
                } else {
                    // Android: Use existing external payment flow
                    const newRep = await ValuProvider.getAttestationPaymentURL();

                    Linking.openURL(newRep.data.url);
                    if (!skipDispatchNotification) {
                        const newLoadingNotification = new NavigationNotification();
                        newLoadingNotification.body = "Continue";
                        newLoadingNotification.title = [`Complete Valu Proof of Personhood`]
                        newLoadingNotification.acchash = activeAccount.accountHash;
                        newLoadingNotification.icon = NOTIFICATION_ICON_VALU;
                        newLoadingNotification.navigate = () => {
                            props.navigation.navigate('ServicesHome', {
                                screen: 'ValuAttestation',
                            });
                        };

                        dispatchAddNotification(newLoadingNotification);
                    }
                }

            } else if (status === VALU_POL_PAYMENT_PENDING) {
                if (Platform.OS === 'ios') {
                    // iOS: Resume IAP flow
                    createAlertDialog(
                        `You already have a Valu Proof of Personhood in progress.`, "RESUME", async () => {
                            try {
                                setLoading(true);
                                const purchaseResult = await AppleIAPManager.completePurchaseFlow();
                                console.log('iOS IAP purchase successful:', purchaseResult);
                                await fetchData();
                                setLoading(false);
                            } catch (iapError) {
                                console.error('iOS IAP error:', iapError);
                                setLoading(false);
                                if (iapError.code !== 'E_USER_CANCELLED' && 
                                    !iapError.message?.includes('cancelled') &&
                                    !iapError.message?.includes('canceled')) {
                                    createAlertDialog(
                                        `Payment failed: ${iapError.message || 'Unknown error'}. Please try again.`,
                                        "OK"
                                    );
                                }
                            }
                        });
                } else {
                    // Android: Use external URL
                    createAlertDialog(
                        `You already have a Valu Proof of Personhood in progress.`, "RESUME", () => { Linking.openURL(valuReply.data.url) });
                }

            } else if (status === VALU_POL_PAYMENT_FAILED) {
                if (Platform.OS === 'ios') {
                    // iOS: Retry IAP flow
                    createAlertDialog(
                        `Your previous payment attempt failed, would you like to try again?`, "RETRY", async () => {
                            try {
                                setLoading(true);
                                const purchaseResult = await AppleIAPManager.completePurchaseFlow();
                                console.log('iOS IAP purchase successful:', purchaseResult);
                                await fetchData();
                                setLoading(false);
                            } catch (iapError) {
                                console.error('iOS IAP error:', iapError);
                                setLoading(false);
                                if (iapError.code !== 'E_USER_CANCELLED' && 
                                    !iapError.message?.includes('cancelled') &&
                                    !iapError.message?.includes('canceled')) {
                                    createAlertDialog(
                                        `Payment failed: ${iapError.message || 'Unknown error'}. Please try again.`,
                                        "OK"
                                    );
                                }
                            }
                        });
                } else {
                    // Android: Show retry dialog (existing behavior)
                    createAlertDialog(
                        `Your previous payment attempt failed, would you like to try again?`, "RETRY");
                }
            } else if (status === VALU_POL_PENDING || status === VALU_POL_IDENTITY_CONFIRMED) {
                // Show loading spinner while checking status
                setLoading(false);
                //showIdentityChoiceModal();
                await continueProofOfPersonhood();
                return;
                // Loading will be set to false in fetchData
            } else if (status === VALU_POL_PAYMENT_RECEIVED) {
                // Show identity choice modal first instead of directly navigating
                setLoading(false);
                showIdentityChoiceModal();
                return;
            } else if (status === VALU_POL_READY) {
                // First check if there are any pending identities that need to be handled
                const pendingStatus = await checkForPendingIdentity();

                if (pendingStatus === 'pending') {
                    // Identity is still being processed, alert was already shown, don't proceed
                    setLoading(false);
                    return;
                } else if (pendingStatus === 'ready') {
                    // Identity is ready to link, modal was shown, don't proceed to deeplink yet
                    setLoading(false);
                    return;
                } else if (pendingStatus === 'auto_linked') {
                    // Identity was automatically linked, proceed with attestation flow
                    createAlertDialog(
                        `Your identity has been successfully confirmed and linked! Now proceeding to get your Valu Attestation.`,
                        "CONTINUE",
                        async () => {
                            try {
                                const newRep = await ValuProvider.getValuAttestationStatus();
                                if (newRep.success === false) {
                                    throw new Error(newRep.error);
                                }
                                // Trigger internal deeplink handler instead of opening externally
                                updateDeeplinkUrl(newRep.data);
                            } catch (error) {
                                console.log('Error proceeding with attestation after auto-link:', error);
                                setLoading(false);
                                createAlertDialog(
                                    `Failed to proceed with attestation: ${error.message}`,
                                    "OK"
                                );
                            }
                        }
                    );
                } else {
                    // No pending identity, proceed with normal flow
                    const newRep = await ValuProvider.getValuAttestationStatus();
                    if (newRep.success === false) {
                        throw new Error(newRep.error);
                    }
                    // Trigger internal deeplink handler instead of opening externally
                    updateDeeplinkUrl(newRep.data);
                }
            } else if (status === POP_RECEIVED) {
                // User already has Proof of Personhood attestation, navigate to Services list
                setLoading(false);

                props.navigation.reset({
                    index: 0,
                    routes: [{ name: 'ServicesHome' }],
                });
            }
        } catch (e) {
            console.log("startOnRamp error", e)
            setLoading(false);
            createAlertDialog(
                `An error occurred while trying to start the Valu Proof of Personhood process. ${e}`, "OK"
            )

        }

    }

    const screenWidth = Dimensions.get('window').width;
    const isInitialStatus = status === VALU_POL_PAYMENT_STARTED || status === "" || status === null;
    const statusMeta = {
        [VALU_POL_PAYMENT_RECEIVED]: { title: 'Payment received', body: "Next, register a new VerusID for your Proof of Personhood. If you already have a VerusID in your wallet, you can select it instead.", cta: 'Register new VerusID' },
        [VALU_POL_PAYMENT_PENDING]: { title: 'Purchase in progress', body: 'Resume your purchase to finish payment.', cta: 'Resume purchase' },
        [VALU_POL_PAYMENT_FAILED]: { title: 'Payment failed', body: 'Please try again.', cta: 'Retry purchase' },
        [VALU_POL_PENDING]: { title: 'Processing your details', body: 'Tap continue to start or resume verification.', cta: 'Verify identity' },
        [VALU_POL_READY]: { title: 'Your proof is ready', body: 'Retrieve your Proof of Personhood now.', cta: 'Get your proof' },
        [POP_RECEIVED]: { title: 'Proof of Personhood complete', body: 'View your attestations and manage your proof.', cta: 'View my Proof of Personhood' },
        [VALU_POL_IDENTITY_CONFIRMED]: { title: 'Identity confirmed', body: "Next, resume your personal details input", cta: 'Resume' },
    };
    const ctaLabel = isInitialStatus ? 'Purchase for $9.99' : (statusMeta[status]?.cta || mainButtonText);

    const getTimelineSteps = () => {
        // Map statuses/flags to 4-step timeline
        const steps = [
            {
                key: 'purchase',
                title: 'Purchase',
                description: isInitialStatus ? 'Buy your Proof of Personhood to begin.' : undefined,
                summary: undefined,
                state: 'todo',
            },
            {
                key: 'identity',
                title: 'Register VerusID',
                description: 'Register a new VerusID or use an existing one in your wallet.',
                summary: undefined,
                state: 'todo',
            },
            {
                key: 'verify',
                title: 'Verify identity',
                description: 'Complete quick one‑time ID verification with SumSub.',
                summary: undefined,
                state: 'todo',
            },
            {
                key: 'issued',
                title: 'Proof issued',
                description: undefined,
                summary: 'Your reusable proof is added to your attestations.',
                state: 'todo',
            },
        ];

        if (status === null || status === '' || status === VALU_POL_PAYMENT_STARTED) {
            steps[0].state = 'active';
        } else if (status === VALU_POL_PAYMENT_PENDING) {
            steps[0].state = 'active';
        } else if (status === VALU_POL_PAYMENT_FAILED) {
            steps[0].state = 'retry';
        } else if (status === VALU_POL_PAYMENT_RECEIVED) {
            steps[0].state = 'done';
            steps[1].state = 'active';
        } else if (showIdentityProvisioningProgress) {
            steps[0].state = 'done';
            steps[1].state = 'active';
            // When provisioning is ongoing, reflect true processing label
            steps[1].state = 'active';
        } else if (status === VALU_POL_PENDING || status === VALU_POL_IDENTITY_CONFIRMED) {
            steps[0].state = 'done';
            steps[1].state = 'done';
            steps[2].state = 'active';
        } else if (status === VALU_POL_READY) {
            steps[0].state = 'done';
            steps[1].state = 'done';
            steps[2].state = 'done';
            steps[3].state = 'active';
        } else if (status === POP_RECEIVED) {
            steps.forEach(s => s.state = 'done');
        }

        return paymentRequired ? steps : steps.filter(s => s.key !== 'purchase');
    };

    return (
        <SafeAreaView style={Styles.defaultRoot}>
            <ScrollView
                style={Styles.fullWidth}
                contentContainerStyle={{ flexGrow: 1, justifyContent: 'space-between', alignItems: 'stretch' }}>
                <View style={{ alignContent: 'center', alignItems: 'stretch', alignSelf: 'stretch', width: '100%', flexGrow: 1 }}>
                    {showIdentityProvisioningProgress ? (
                        <React.Fragment>
                            {/* Gradient title and tagline (match other states) */}
                            <View style={{ alignSelf: 'stretch', paddingHorizontal: 24, marginTop: 32, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: '#EDEDED' }}>
                                <Svg width={screenWidth - 48} height={125}>
                                    <Defs>
                                        <SvgLinearGradient id="valuGradient" x1="0" y1="0" x2="1" y2="1">
                                            <Stop offset="0" stopColor="#00C8FF" />
                                            <Stop offset="1" stopColor="#0077A9" />
                                        </SvgLinearGradient>
                                    </Defs>
                                    <SvgText
                                        x={0}
                                        y={45}
                                        fontSize={54}
                                        fontWeight={'800'}
                                        textAnchor={'start'}
                                        fill={'url(#valuGradient)'}
                                    >
                                        {Array.from('Proof of').map((ch, i) => (
                                            <TSpan key={`p1-${i}`} dx={i === 0 ? 0 : -1.5}>{ch}</TSpan>
                                        ))}
                                    </SvgText>
                                    <SvgText
                                        x={0}
                                        y={95}
                                        fontSize={54}
                                        fontWeight={'800'}
                                        textAnchor={'start'}
                                        fill={'url(#valuGradient)'}
                                    >
                                        {Array.from('Personhood').map((ch, i) => (
                                            <TSpan key={`p2-${i}`} dx={i === 0 ? 0 : -1.5}>{ch}</TSpan>
                                        ))}
                                    </SvgText>
                                </Svg>
                                <Text style={{ fontSize: 18, color: '#666', marginTop: -8, marginBottom: 12, textAlign: 'left' }}>
                                    {'Verify once. Prove privately anywhere.'}
                                </Text>
                            </View>

                            {/* Progress content styled like status sections */}
                            <View style={{ alignSelf: 'stretch', paddingHorizontal: 24, paddingVertical: 20, marginTop: 16, alignItems: 'center' }}>
                                <AnimatedActivityIndicator
                                    style={{
                                        width: 64,
                                        marginBottom: 12
                                    }}
                                />
                                <Text style={{ fontSize: 15, color: '#555', lineHeight: 21, textAlign: 'center' }}>
                                    {'Please wait while we register your identity request...'}
                                </Text>
                            </View>
                        </React.Fragment>
                    ) : loading || status === null ? (
                        <React.Fragment>
                            <View style={{ alignSelf: 'stretch', paddingHorizontal: 24, marginTop: 32, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: '#EDEDED' }}>
                                <Animated.View style={{ opacity: pulse, width: '70%', height: 44, backgroundColor: '#E8E8E8', borderRadius: 6, marginBottom: 8 }} />
                                <Animated.View style={{ opacity: pulse, width: '50%', height: 44, backgroundColor: '#E8E8E8', borderRadius: 6 }} />
                                <Animated.View style={{ opacity: pulse, width: '60%', height: 14, backgroundColor: '#E8E8E8', borderRadius: 4, marginTop: 8 }} />
                            </View>
                            <View style={{ alignSelf: 'stretch', paddingHorizontal: 24, paddingVertical: 20, marginTop: 16 }}>
                                <Animated.View style={{ opacity: pulse, width: 120, height: 16, backgroundColor: '#E8E8E8', borderRadius: 4, marginBottom: 8 }} />
                                <Animated.View style={{ opacity: pulse, width: '100%', height: 12, backgroundColor: '#E8E8E8', borderRadius: 4, marginBottom: 6 }} />
                                <Animated.View style={{ opacity: pulse, width: '92%', height: 12, backgroundColor: '#E8E8E8', borderRadius: 4, marginBottom: 16 }} />
                                <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 }}>
                                    <Animated.View style={{ opacity: pulse, width: 18, height: 18, borderRadius: 9, backgroundColor: '#E8E8E8', marginRight: 10, marginTop: 2 }} />
                                    <View style={{ flex: 1 }}>
                                        <Animated.View style={{ opacity: pulse, width: 120, height: 12, backgroundColor: '#E8E8E8', borderRadius: 4, marginBottom: 6 }} />
                                        <Animated.View style={{ opacity: pulse, width: '90%', height: 12, backgroundColor: '#E8E8E8', borderRadius: 4 }} />
                                    </View>
                                </View>
                                <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                                    <Animated.View style={{ opacity: pulse, width: 18, height: 18, borderRadius: 9, backgroundColor: '#E8E8E8', marginRight: 10, marginTop: 2 }} />
                                    <View style={{ flex: 1 }}>
                                        <Animated.View style={{ opacity: pulse, width: 120, height: 12, backgroundColor: '#E8E8E8', borderRadius: 4, marginBottom: 6 }} />
                                        <Animated.View style={{ opacity: pulse, width: '90%', height: 12, backgroundColor: '#E8E8E8', borderRadius: 4 }} />
                                    </View>
                                </View>
                            </View>
                        </React.Fragment>
                    ) : (
                        <React.Fragment>
                            {/* Large gradient title - left aligned, two lines */}
                            {/* Header box with subtle divider */}
                            <View style={{ alignSelf: 'stretch', paddingHorizontal: 24, marginTop: 32, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: '#EDEDED' }}>
                                <Svg width={screenWidth - 48} height={125}>
                                    <Defs>
                                        <SvgLinearGradient id="valuGradient" x1="0" y1="0" x2="1" y2="1">
                                            <Stop offset="0" stopColor="#00C8FF" />
                                            <Stop offset="1" stopColor="#0077A9" />
                                        </SvgLinearGradient>
                                    </Defs>
                                    <SvgText
                                        x={0}
                                        y={45}
                                        fontSize={54}
                                        fontWeight={'800'}
                                        textAnchor={'start'}
                                        fill={'url(#valuGradient)'}
                                    >
                                        {Array.from('Proof of').map((ch, i) => (
                                            <TSpan key={`p1-${i}`} dx={i === 0 ? 0 : -1.5}>{ch}</TSpan>
                                        ))}
                                    </SvgText>
                                    <SvgText
                                        x={0}
                                        y={95}
                                        fontSize={54}
                                        fontWeight={'800'}
                                        textAnchor={'start'}
                                        fill={'url(#valuGradient)'}
                                    >
                                        {Array.from('Personhood').map((ch, i) => (
                                            <TSpan key={`p2-${i}`} dx={i === 0 ? 0 : -1.5}>{ch}</TSpan>
                                        ))}
                                    </SvgText>
                                </Svg>

                                {/* Tagline */}
                                <Text style={{ fontSize: 18, color: '#666', marginTop: -8, marginBottom: 12, textAlign: 'left' }}>
                                    {'Verify once. Prove privately anywhere.'}
                                </Text>
                            </View>

                            {/* Content area (no background): show intro before purchase, timeline after */}
                            <View style={{ alignSelf: 'stretch', paddingHorizontal: 24, paddingVertical: 16, marginTop: 12 }}>
                                {isInitialStatus ? (
                                    <View>
                                        <View style={{ marginBottom: 12 }}>
                                            <Text style={{ fontSize: 15, fontWeight: '600', color: '#1A1A1A', marginBottom: 6 }}>What you get</Text>
                                            <Text style={{ fontSize: 13, color: '#555', lineHeight: 18 }}>
                                                You receive a reusable Proof of Personhood attestation linked to your VerusID. It lets you prove you're a unique, verified person—without exposing your personal details by default.
                                            </Text>
                                        </View>
                                        <View style={{ width: '100%' }}>
                                            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 3 }}>
                                                <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: '#E8E8E8', alignItems: 'center', justifyContent: 'center', marginRight: 10 }}>
                                                    <MaterialCommunityIcons name={'shield-outline'} size={15} color={'black'} />
                                                </View>
                                                <Text style={{ fontSize: 13, fontWeight: '600', color: '#1A1A1A' }}>Privacy‑first</Text>
                                            </View>
                                            <Text style={{ fontSize: 12, color: '#555', lineHeight: 16, marginBottom: 8 }}>
                                                Share a cryptographic proof, not your documents.
                                            </Text>
                                            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 3 }}>
                                                <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: '#E8E8E8', alignItems: 'center', justifyContent: 'center', marginRight: 10 }}>
                                                    <MaterialCommunityIcons name={'check-circle-outline'} size={15} color={'black'} />
                                                </View>
                                                <Text style={{ fontSize: 13, fontWeight: '600', color: '#1A1A1A' }}>One‑time setup</Text>
                                            </View>
                                            <Text style={{ fontSize: 12, color: '#555', lineHeight: 16 }}>
                                                Verify once and reuse across supported services.
                                            </Text>
                                        </View>
                                    </View>
                                ) : (
                                    <TimelineList steps={getTimelineSteps()} />
                                )}
                            </View>

                        </React.Fragment>
                    )}
                </View>
                {/* Bottom container pinned by space-between */}
                <View style={{ width: '100%', alignSelf: 'stretch' }}>
                    {loading || status === null ? (
                        <View style={{ paddingHorizontal: 20, paddingBottom: 24 }}>
                            <Animated.View style={{ opacity: pulse, width: '100%', height: 48, backgroundColor: '#E8E8E8', borderRadius: 24 }} />
                        </View>
                    ) : (
                        <React.Fragment>
                            {status !== POP_RECEIVED && (
                                <TouchableOpacity onPress={() => setHowItWorksVisible(true)} activeOpacity={0.7} style={{ marginBottom: 16 }}>
                                    <Text style={{ fontSize: 14, color: '#666', textDecorationLine: 'underline', textAlign: 'center' }}>{'How it works'}</Text>
                                </TouchableOpacity>
                            )}
                            <View style={{ paddingHorizontal: 20, paddingBottom: 24, width: '100%', alignSelf: 'stretch' }}>
                                <GradientButton
                                    onPress={() => { startOnRamp() }}
                                    disabled={status === 'error' || showIdentityProvisioningProgress}
                                    style={{ width: '100%' }}
                                >
                                    {ctaLabel}
                                </GradientButton>
                            </View>
                        </React.Fragment>
                    )}
                </View>
            </ScrollView>

            {/* How it works SemiModal */}
            <Portal>
                {howItWorksVisible && (
                    <SemiModal
                        animationType={'slide'}
                        transparent={true}
                        visible={true}
                        onRequestClose={() => setHowItWorksVisible(false)}
                        title="How it works"
                        flexHeight={0.01}
                        contentContainerStyle={{
                            borderTopLeftRadius: 16,
                            borderTopRightRadius: 16,
                            flex: 0,
                            alignSelf: 'flex-end',
                            width: '100%',
                            maxHeight: '70%',
                        }}
                    >
                        <View>
                            <View style={{ paddingHorizontal: 16, paddingBottom: 24 }}>


                                {/* Step 1 */}
                                <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 16 }}>
                                    <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: '#E8E8E8', alignItems: 'center', justifyContent: 'center', marginRight: 12, marginTop: 2 }}>
                                        <Text style={{ fontSize: 12, fontWeight: '600', color: 'black' }}>1</Text>
                                    </View>
                                    <Text style={{ fontSize: 14, color: '#333', lineHeight: 20, flex: 1 }}>{paymentRequired ? "Choose or create your VerusID (included with the purchase)." : "Choose or create your VerusID."}</Text>
                                </View>

                                {/* Step 2 */}
                                <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 16 }}>
                                    <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: '#E8E8E8', alignItems: 'center', justifyContent: 'center', marginRight: 12, marginTop: 2 }}>
                                        <Text style={{ fontSize: 12, fontWeight: '600', color: 'black' }}>2</Text>
                                    </View>
                                    <Text style={{ fontSize: 14, color: '#333', lineHeight: 20, flex: 1 }}>Complete a quick one‑time identity check (ID + selfie + proof of residence).</Text>
                                </View>

                                {/* Step 3 */}
                                <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 16 }}>
                                    <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: '#E8E8E8', alignItems: 'center', justifyContent: 'center', marginRight: 12, marginTop: 2 }}>
                                        <Text style={{ fontSize: 12, fontWeight: '600', color: 'black' }}>3</Text>
                                    </View>
                                    <Text style={{ fontSize: 14, color: '#333', lineHeight: 20, flex: 1 }}>We issue a cryptographic proof bound to your VerusID—not your personal data.</Text>
                                </View>

                                {/* Step 4 */}
                                <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 20 }}>
                                    <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: '#E8E8E8', alignItems: 'center', justifyContent: 'center', marginRight: 12, marginTop: 2 }}>
                                        <Text style={{ fontSize: 12, fontWeight: '600', color: 'black' }}>4</Text>
                                    </View>
                                    <Text style={{ fontSize: 14, color: '#333', lineHeight: 20, flex: 1 }}>Reuse this proof to verify in seconds across supported services.</Text>
                                </View>

                                <Text style={{ fontSize: 14, color: '#666', marginBottom: 24 }}>{'Estimated time: About 5–10 minutes'}</Text>

                                {/* Got it button */}
                                <GradientButton
                                    onPress={() => setHowItWorksVisible(false)}
                                    style={{ width: '100%', marginBottom: 20 }}
                                >
                                    Got it
                                </GradientButton>
                            </View>
                        </View>
                    </SemiModal>
                )}

                {/* Identity Choice Sheet (SemiModal) */}
                {identityChoiceModalVisible && (
                    <SemiModal
                        animationType={'slide'}
                        transparent={true}
                        visible={true}
                        onRequestClose={() => setIdentityChoiceModalVisible(false)}
                        title="Choose identity option"
                        flexHeight={0.01}
                        contentContainerStyle={{
                            borderTopLeftRadius: 16,
                            borderTopRightRadius: 16,
                            flex: 0,
                            alignSelf: 'flex-end',
                            width: '100%',
                            maxHeight: '70%'
                        }}
                    >
                        <View>
                            <View style={{ paddingHorizontal: 16, paddingBottom: 24 }}>
                                <Text style={{ fontSize: 14, color: '#666', lineHeight: 20, marginBottom: 16 }}>
                                    {'Do you want to register a new VerusID or use an existing identity for your attestation?'}
                                </Text>

                                <List.Item
                                    title="Register new VerusID"
                                    description="Create a new VerusID for this attestation"
                                    onPress={continueWithNewValuId}
                                    left={(props) => <List.Icon {...props} icon="plus" color={'black'} />}
                                    right={(props) => <List.Icon {...props} icon="chevron-right" />}
                                    titleStyle={{ fontSize: 18, fontWeight: '600', color: 'black' }}
                                    descriptionStyle={{ fontSize: 14, color: '#666', marginTop: 6 }}
                                    style={{ backgroundColor: 'white', borderRadius: 12, marginBottom: 12, paddingVertical: 8 }}
                                />

                                <List.Item
                                    title="Use VerusID in wallet"
                                    description="Link attestation to an existing VerusID in your wallet"
                                    onPress={showExistingIdentityModal}
                                    left={(props) => <List.Icon {...props} icon="account" color={'black'} />}
                                    right={(props) => <List.Icon {...props} icon="chevron-right" />}
                                    titleStyle={{ fontSize: 18, fontWeight: '600', color: 'black' }}
                                    descriptionStyle={{ fontSize: 14, color: '#666', marginTop: 6 }}
                                    style={{ backgroundColor: 'white', borderRadius: 12, paddingVertical: 8 }}
                                />
                            </View>
                        </View>
                    </SemiModal>
                )}

                {/* Existing Identity Selection Modal */}
                {existingIdentityModalVisible && (
                    <ListSelectionModal
                        title="Select Identity"
                        flexHeight={3}
                        visible={existingIdentityModalVisible}
                        showSearch={true}
                        searchPlaceholder="Search identities"
                        onSelect={(item) => selectExistingIdentity(item.key)}
                        data={[
                            // Existing identities from the network
                            ...((sortedIds[verusNetwork] || []).map((iAddr) => ({
                                key: iAddr,
                                title: linkedIds[verusNetwork][iAddr],
                                description: iAddr
                            }))),
                            // Link new identity option
                            {
                                key: 'link_new',
                                title: 'Link VerusID',
                                description: 'Connect a new VerusID to your wallet',
                                isAction: true
                            }
                        ]}
                        cancel={() => setExistingIdentityModalVisible(false)}
                        renderItem={(item, index, onSelect) => {
                            if (item.isAction) {
                                return (
                                    <React.Fragment key={item.key}>
                                        <Divider />
                                        <List.Item
                                            title={item.title}
                                            description={item.description}
                                            left={props => <List.Icon {...props} icon={'plus'} />}
                                            onPress={() => openLinkIdentityModalFromChain()}
                                        />
                                    </React.Fragment>
                                );
                            }
                            return (
                                <React.Fragment key={item.key}>
                                    <Divider />
                                    <List.Item
                                        title={item.title}
                                        description={item.description}
                                        descriptionNumberOfLines={1}
                                        titleNumberOfLines={1}
                                        left={props => <List.Icon {...props} icon={'account'} />}
                                        right={props => (
                                            <List.Icon {...props} icon={'chevron-right'} size={20} />
                                        )}
                                        onPress={() => onSelect(item)}
                                    />
                                </React.Fragment>
                            );
                        }}
                    />
                )}

                {/* Pending Identity Link Modal */}
                <Dialog visible={showPendingIdentityModal} onDismiss={() => setShowPendingIdentityModal(false)}>
                    <Dialog.Title>Link Your New Identity</Dialog.Title>
                    <Dialog.Content>
                        {pendingIdentityInfo && (
                            <View>
                                <Text style={{ fontSize: 16, marginBottom: 10 }}>
                                    Your new VerusID is ready to be linked:
                                </Text>
                                <Text style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 5 }}>
                                    {pendingIdentityInfo.details.provisioningName || pendingIdentityInfo.details.fqn}
                                </Text>
                                <Text style={{ fontSize: 14, color: Colors.secondaryColor, marginBottom: 15 }}>
                                    Address: {pendingIdentityInfo.address}
                                </Text>
                                <Text style={{ fontSize: 14, marginBottom: 10 }}>
                                    Would you like to link this identity to your wallet now?
                                </Text>
                            </View>
                        )}
                    </Dialog.Content>
                    <Dialog.Actions>
                        <Button onPress={() => setShowPendingIdentityModal(false)}>Cancel</Button>
                        <Button
                            onPress={linkPendingIdentity}
                            mode="contained"
                            disabled={loading}
                        >
                            Link Identity
                        </Button>
                    </Dialog.Actions>
                </Dialog>
            </Portal>
        </SafeAreaView>
    );

};

const mapStateToProps = (state) => {
    return {
        activeAccount: state.authentication.activeAccount,
    }
};

export default connect(mapStateToProps)(ValuAttestation);
