/*
  GetSponsoredAttestation - Simplified PoP claim flow for users eligible after on/off-ramp
  
  This screen provides a streamlined 2-step process:
  1. Register/Link VerusID
  2. Receive Proof of Personhood
  
  Unlike the full ValuAttestation flow (which includes payment), this flow is for users
  who have already completed KYC through on-ramp or off-ramp transactions and are now
  eligible to claim their sponsored Proof of Personhood attestation.
*/

import React, { useEffect, useState, useCallback, useRef } from "react";
import { connect, useSelector } from 'react-redux';
import { useFocusEffect } from '@react-navigation/native';
import { CommonActions } from '@react-navigation/native';
import InAppBrowser from 'react-native-inappbrowser-reborn';
import { primitives, VerusIdInterface } from "verusid-ts-client";
import { SafeAreaView, ScrollView, View, Linking, AppState, Dimensions, TouchableOpacity, Animated, Platform } from 'react-native';

import { Button, Text } from 'react-native-paper';
import ListSelectionModal from "../../../../../components/ListSelectionModal/ListSelectionModal";
import { requestServiceStoredData } from "../../../../../utils/auth/authBox";
import { VERUSID_SERVICE_ID } from "../../../../../utils/constants/services";
import { CoinDirectory } from "../../../../../utils/CoinData/CoinDirectory";
import { openLinkIdentityModal } from "../../../../../actions/actions/sendModal/dispatchers/sendModal";
import { useObjectSelector } from "../../../../../hooks/useObjectSelector";
import Styles from "../../../../../styles";
import Colors from '../../../../../globals/colors';
import { requestAttestationData, requestSeeds } from "../../../../../utils/auth/authBox";
import { ATTESTATIONS_PROVISIONED } from "../../../../../utils/constants/attestations";
import { signIdProvisioningRequest } from '../../../../../utils/api/channels/vrpc/requests/signIdProvisioningRequest';
import { NavigationNotification, LoadingNotification } from '../../../../../utils/notification';
import { dispatchAddNotification } from '../../../../../actions/actions/notifications/dispatchers/notifications';
import { NOTIFICATION_ICON_VALU, NOTIFICATION_TYPE_NAVIGATION, NOTIFICATION_ICON_VERUSID } from '../../../../../utils/constants/notifications';
import { createAlert, resolveAlert } from '../../../../../actions/actions/alert/dispatchers/alert';
import {
    VALU_POL_IDENTITY_PROVISIONED_PENDING, VALU_POL_IDENTITY_PROVISIONED, VALU_POL_READY,
    NOTIFICATION_TYPE_VERUSID_PENDING, VALU_POL_PENDING, NOTIFICATION_TYPE_VERUSID_READY,
    POP_RECEIVED, VALU_POL_IDENTITY_CONFIRMED
} from '../../../../../utils/constants/services';
import AnimatedActivityIndicator from "../../../../../components/AnimatedActivityIndicator";
import ValuProvider from "../../../../../utils/services/ValuProvider";
import { ATTESTATION_SERVICE_ID } from "../../../../../utils/constants/services";
import { updatePendingVerusIds } from "../../../../../actions/actions/channels/verusid/dispatchers/VerusidWalletReduxManager";
import { setRequestedVerusId, linkVerusId, deleteAllProvisionedIds } from '../../../../../actions/actions/services/dispatchers/verusid/verusid';
import { 
    updateSponsoredAttestationIdentity, 
    completeSponsoredAttestation, 
    resetSponsoredAttestation 
} from '../../../../../actions/actions/channels/valu/dispatchers/ValuWalletReduxManager';
import { updateDeeplinkUrl } from '../../../../../actions/actionDispatchers';
import Svg, { Defs, LinearGradient as SvgLinearGradient, Stop, Rect, Text as SvgText, TSpan } from 'react-native-svg';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import TimelineList from '../../../../../components/Timeline/TimelineList';

const GetSponsoredAttestation = (props) => {
    const activeAccount = useSelector(state => state.authentication.activeAccount);
    const signedIn = useSelector(state => state.authentication.signedIn);
    const verusNetwork = Object.keys(activeAccount.testnetOverrides).length > 0 ? 'VRSCTEST' : 'VRSC';
    const [loading, setLoading] = useState(true);
    const [status, setStatus] = useState(null);
    const [identityChoiceModalVisible, setIdentityChoiceModalVisible] = useState(false);
    const [existingIdentityModalVisible, setExistingIdentityModalVisible] = useState(false);
    const [linkedIds, setLinkedIds] = useState({});
    const [sortedIds, setSortedIds] = useState({});
    const [isProvisioningIdentity, setIsProvisioningIdentity] = useState(false);
    const [showIdentityProvisioningProgress, setShowIdentityProvisioningProgress] = useState(false);
    const [showPendingIdentityModal, setShowPendingIdentityModal] = useState(false);
    const [pendingIdentityInfo, setPendingIdentityInfo] = useState(null);
    const pendingIds = useSelector(state => state.channelStore_verusid.pendingIds);
    
    // Get sponsored attestation state from Redux
    const sponsoredAttestationState = useSelector(state => state.channelStore_valu_service.sponsoredAttestation);
    const isValuAuthenticated = useSelector(state => state.channelStore_valu_service.authenticated);

    // While registering identity, hide back button and disable gestures
    useEffect(() => {
        if (props.navigation?.setOptions) {
            props.navigation.setOptions({
                headerLeft: showIdentityProvisioningProgress ? () => null : undefined,
                gestureEnabled: !showIdentityProvisioningProgress,
            });
        }
    }, [showIdentityProvisioningProgress]);

    // Navigation reset function
    const resetToHome = () => {
        let resetAction;
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
    };

    // Shared function for new identity provisioning
    const provisionNewIdentity = async (identityName, source = 'identity request') => {
        setIsProvisioningIdentity(true);
        setShowIdentityProvisioningProgress(true);
        try {

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
                    parent: "iQ2TqQot9W7mLrcCRJKnAZmaPTTY6sx4S4"
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

            newLoadingNotification.title = [identityName, ' is being provisioned by ', 'ValuID@', '. Please wait a moment.'];
            newLoadingNotification.acchash = activeAccount.accountHash;
            newLoadingNotification.icon = NOTIFICATION_ICON_VERUSID;

            dispatchAddNotification(newLoadingNotification);
            setShowIdentityProvisioningProgress(false);
            setIsProvisioningIdentity(false);

            // Update Redux state to track identity provisioning
            updateSponsoredAttestationIdentity(identityName, identityAddress, false, true);

            return { identityName, identityAddress, continueFlow: true };

        } catch (error) {
            console.error(`Error provisioning identity from ${source}:`, error);
            setShowIdentityProvisioningProgress(false);
            setIsProvisioningIdentity(false);
            createAlert(
                'Identity Registration Failed',
                'An error occurred while setting up your identity. ' + error.message,
                [{ text: 'OK', onPress: () => { resolveAlert(); resetToHome(); } }],
                { cancelable: false }
            );
            throw error;
        }
    };

    // Navigate to Attestations list
    const navigateToAttestations = () => {
        const parentNav = props.navigation?.getParent?.() || null;
        if (parentNav) {
            parentNav.navigate('ServicesHome', {
                screen: 'Service',
                params: { service: ATTESTATION_SERVICE_ID },
            });
            return;
        }
        if (props.navigation?.replace) {
            props.navigation.replace('Service', { service: ATTESTATION_SERVICE_ID });
        } else {
            props.navigation.navigate('Service', { service: ATTESTATION_SERVICE_ID });
        }
    };

    // Continue with proof of personhood (claim the attestation)
    const continueProofOfPersonhood = async (identityInfo) => {
        try {
            setLoading(true);

            // User has already completed KYC through on/off-ramp
            // If they selected an existing identity, claim the proof immediately
            // If they registered a new identity, wait for provisioning to complete (notification will handle this)
            
            if (identityInfo?.isExisting) {
                // For existing identities, we can claim the proof right away
                // Update Redux state to mark identity as selected (existing, not pending)
                updateSponsoredAttestationIdentity(
                    identityInfo.identityName, 
                    identityInfo.identityAddress, 
                    true, // isExisting = true
                    false // isPending = false (already exists!)
                );
                
                // Call backend API to claim the sponsored attestation
                if (!isValuAuthenticated) {
                    throw new Error('Valu service is not authenticated. Please try logging out and back in.');
                }
                
                let claimResult;
                try {
                    claimResult = await ValuProvider.claimSponsoredAttestation({
                        identityAddress: identityInfo.identityAddress,
                        identityName: identityInfo.identityName
                    });
                } catch (apiError) {
                    console.error('❌ API call failed:', apiError);
                    throw apiError;
                }
                
                if (claimResult?.success) {
                    // Don't mark as complete yet - wait until we actually get the attestation
                    
                    // Give backend a moment to process the identity linking and generate attestation
                    await new Promise(resolve => setTimeout(resolve, 3000));
                    
                    // Fetch the attestation deeplink
                    let attestationStatus;
                    try {
                        attestationStatus = await ValuProvider.getValuAttestationStatus();
                    } catch (fetchError) {
                        console.error('❌ Error fetching attestation:', fetchError);
                        // If we get an error, don't mark as complete - let user retry
                        setLoading(false);
                        createAlert(
                            'Attestation Still Processing',
                            `Your identity has been linked successfully, but the attestation is still being generated. Please wait a moment and try again, or you'll receive a notification when it's ready.`,
                            [{ text: 'OK', onPress: () => resolveAlert() }],
                            { cancelable: false }
                        );
                        return;
                    }
                    
                    if (attestationStatus?.data) {
                        // Backend returned a deeplink - NOW mark as complete and dispatch it
                        completeSponsoredAttestation();
                        updateDeeplinkUrl(attestationStatus.data);
                        setLoading(false);
                        // The deeplink will be handled by the deeplink saga and open the acceptance screen
                    } else if (attestationStatus?.success === false && /not controlled by your wallet/i.test(attestationStatus.error || '')) {
                        // The server only issues attestations for identities this wallet controls
                        setLoading(false);
                        createAlert(
                            'Identity Not Linked',
                            attestationStatus.error,
                            [{ text: 'OK', onPress: () => resolveAlert() }],
                            { cancelable: false }
                        );
                    } else if (attestationStatus?.success === false) {
                        // Backend returned an error - don't mark as complete
                        console.error('❌ Backend error getting attestation:', attestationStatus.error);
                        setLoading(false);
                        createAlert(
                            'Attestation Processing',
                            `Your identity has been linked but the attestation is still being generated. You'll receive a notification when it's ready, or try again in a moment.`,
                            [{ text: 'OK', onPress: () => resolveAlert() }],
                            { cancelable: false }
                        );
                    } else {
                        // No deeplink yet, but no error - attestation still processing
                        setLoading(false);
                        createAlert(
                            'Attestation Processing',
                            `Your Proof of Personhood is being prepared for ${identityInfo.identityName}. You'll receive a notification when it's ready, or try again in a moment.`,
                            [{ text: 'OK', onPress: () => resolveAlert() }],
                            { cancelable: false }
                        );
                    }
                } else {
                    console.error('❌ claimResult.success is false:', claimResult);
                    throw new Error(claimResult?.error || 'Failed to claim attestation');
                }
            } else {
                // For new identities, the provisioning notification was already created
                // Just inform the user to wait
                createAlert(
                    'Identity Registration in Progress',
                    'Your identity is being registered on the blockchain. You\'ll receive a notification when it\'s ready, and then your Proof of Personhood will be issued automatically.',
                    [{ text: 'OK', onPress: () => { resolveAlert(); resetToHome(); } }],
                    { cancelable: false }
                );
            }
            
            setLoading(false);
        } catch (error) {
            console.error("❌ Error claiming proof of personhood:", error);
            setLoading(false);
            createAlert(
                'Error Claiming Proof',
                'An error occurred while trying to claim your Proof of Personhood. ' + (error.response?.data?.error || error.message),
                [{ text: 'OK', onPress: () => { resolveAlert(); setLoading(false); } }],
                { cancelable: false }
            );
        }
    };

    const handleProvisioningResponse = async (notificationUid, identityName, identityID, uri, loginRequest, fqn) => {
        const verusIdState = {
            status: NOTIFICATION_TYPE_VERUSID_PENDING,
            fqn: fqn,
            loginRequest: loginRequest.toBuffer().toString('base64'),
            fromService: false,
            createdAt: Number((Date.now() / 1000).toFixed(0)),
            infoUri: uri,
            provisioningName: identityName,
            notificationUid: notificationUid
        };
        await setRequestedVerusId(identityID, verusIdState, CoinDirectory.findCoinObj(verusNetwork).id);
        await updatePendingVerusIds();
    };

    // Load existing identities
    const loadLinkedIdentities = async () => {
        try {
            const verusIdServiceData = await requestServiceStoredData(VERUSID_SERVICE_ID);
            
            if (verusIdServiceData?.linked_ids) {
                // The data structure is: { linked_ids: { VRSC: { iAddress: "name@" }, VRSCTEST: {...} } }
                const linkedIdsPerChain = verusIdServiceData.linked_ids;
                
                // Get the IDs for the current network (VRSC or VRSCTEST)
                const networkIds = linkedIdsPerChain[verusNetwork] || {};
                
                // Sort alphabetically by identity name
                const sortedArray = Object.entries(networkIds).sort((a, b) => {
                    return a[1].localeCompare(b[1]);
                });
                const sorted = {};
                sortedArray.forEach(([key, value]) => {
                    sorted[key] = value;
                });
                
                // Update both states together
                setLinkedIds(networkIds);
                setSortedIds(sorted);
                
                return sorted; // Return the sorted IDs for immediate use
            } else {
                setLinkedIds({});
                setSortedIds({});
                return {};
            }
        } catch (e) {
            // Silently fail if authentication isn't ready yet
            setLinkedIds({});
            setSortedIds({});
            return {};
        }
    };

    // Handle selection of existing identity
    const selectExistingIdentity = async (iAddress) => {
        try {
            setExistingIdentityModalVisible(false);
            
            const identityName = linkedIds[iAddress];
            
            if (!identityName) {
                createAlert(
                    'Invalid Selection',
                    'Please select a valid identity.',
                    [{ text: 'OK', onPress: () => resolveAlert() }],
                    { cancelable: false }
                );
                return;
            }
            
            setLoading(true);
            
            // Update Redux state
            updateSponsoredAttestationIdentity(identityName, iAddress, true, false);
            
            await continueProofOfPersonhood({
                identityName,
                identityAddress: iAddress,
                isExisting: true
            });
        } catch (error) {
            console.error("Error selecting existing identity:", error);
            setLoading(false);
            createAlert(
                'Selection Error',
                'Failed to select identity: ' + error.message,
                [{ text: 'OK', onPress: () => resolveAlert() }],
                { cancelable: false }
            );
        }
    };

    // Handle new identity request
    const handleNewIdentityRequest = async (identityName) => {
        try {
            const identityInfo = await provisionNewIdentity(identityName, 'sponsored attestation');
            if (identityInfo?.continueFlow) {
                await continueProofOfPersonhood(identityInfo);
            }
        } catch (error) {
            console.error("Error with new identity request:", error);
        }
    };

    // Show identity choice modal
    const showIdentityChoiceModal = async () => {
        await loadLinkedIdentities();
        setIdentityChoiceModalVisible(true);
    };

    // Continue with new VerusID
    const continueWithNewValuId = async () => {
        setIdentityChoiceModalVisible(false);
        props.navigation.navigate('ValuChooseIdentity', {
            returnScreen: 'GetSponsoredAttestation',
            onIdentityChosen: handleNewIdentityRequest
        });
    };

    // Show existing identity modal
    const showExistingIdentityModal = async () => {
        setIdentityChoiceModalVisible(false);
        const loadedIds = await loadLinkedIdentities();
        
        // Check if user has any IDs - only show modal if they have IDs
        if (!loadedIds || Object.keys(loadedIds).length === 0) {
            return;
        }
        
        setExistingIdentityModalVisible(true);
    };

    // Check for pending identities
    const checkForPendingIdentity = async () => {
        if (pendingIds && Object.keys(pendingIds).length > 0) {
            const pendingId = Object.values(pendingIds)[0];
            if (pendingId.status === NOTIFICATION_TYPE_VERUSID_READY) {
                setPendingIdentityInfo(pendingId);
                setShowPendingIdentityModal(true);
                return true;
            }
        }
        return false;
    };

    // Link pending identity
    const linkPendingIdentity = async () => {
        try {
            setShowPendingIdentityModal(false);
            setLoading(true);
            
            const identityId = Object.keys(pendingIds)[0];
            await linkVerusId(identityId, CoinDirectory.findCoinObj(verusNetwork).id);
            await loadLinkedIdentities();
            
            // Update Redux state - identity is now ready
            updateSponsoredAttestationIdentity(pendingIdentityInfo.fqn, identityId, true, false);
            
            // Continue with the newly linked identity
            await continueProofOfPersonhood({
                identityName: pendingIdentityInfo.fqn,
                identityAddress: identityId,
                isExisting: true
            });
        } catch (error) {
            console.error("Error linking pending identity:", error);
            setLoading(false);
        }
    };

    // Main fetch data function
    const fetchData = useCallback(async () => {
        if (!loading) setLoading(true);
        if (isProvisioningIdentity) return;

        // Check if user already has PoP - if so, redirect to attestations
        let attestationPresent = false;
        try {
            const attestationData = await requestAttestationData(ATTESTATIONS_PROVISIONED);
            if (attestationData && Object.keys(attestationData).length > 0) {
                // attestationData is an object with attestation IDs as keys
                const attestations = Object.values(attestationData);
                
                attestationPresent = attestations.some(
                    (attestationItem) => attestationItem.name === "Valu Proof of Personhood"
                );
            }
        } catch (e) {
            console.warn("Error checking for existing Proof of Personhood:", e);
        }

        if (attestationPresent) {
            setLoading(false);
            // Navigate to attestations list instead of staying on this screen
            navigateToAttestations();
            return;
        }

        // Check attestation status
        try {
            const newRep = await ValuProvider.getValuAttestationStatus();
            
            if (newRep.success === false) {
                throw new Error(newRep.error);
            }
            
            // If response contains a deeplink, dispatch it for internal handling
            if (newRep.data) {
                updateDeeplinkUrl(newRep.data);
                setLoading(false);
                return;
            }
            
            if (newRep.status) {
                setStatus(newRep.status);
            } else {
                // No status returned - user hasn't started the flow yet
                setStatus(null);
            }
        } catch (e) {
            console.warn("Error fetching attestation status:", e);
            // On error, set to null to show initial state
            setStatus(null);
        }

        setLoading(false);
    }, [isProvisioningIdentity, loading]);

    useEffect(() => {
        fetchData();
    }, []);

    useFocusEffect(
        useCallback(() => {
            const routeParams = props.route?.params;
            if (routeParams?.continueFlow && routeParams?.chosenIdentity) {
                // User returned from ValuChooseIdentity with a chosen identity
                continueWithIdentity(routeParams.chosenIdentity);
                // Clear the params to avoid re-execution
                props.navigation.setParams({ continueFlow: false, chosenIdentity: null });
            } else if (routeParams?.identityChosen) {
                // Legacy support
                const { identityName } = routeParams;
                handleNewIdentityRequest(identityName);
                props.navigation.setParams({ identityChosen: false });
            }
        }, [props.route?.params])
    );

    const continueWithIdentity = async (chosenIdentity) => {
        try {
            const result = await provisionNewIdentity(chosenIdentity, 'GetSponsoredAttestation screen');
            if (result?.continueFlow) {
                // Continue with proof of personhood after identity provisioning
                await continueProofOfPersonhood(result);
            }
        } catch (error) {
            console.error('Error in continueWithIdentity:', error);
        }
    };

    // Get timeline steps (simplified 2-step version)
    const getTimelineSteps = () => {
        const steps = [];
        
        const hasIdentityInState = sponsoredAttestationState.currentStep >= 1;
        const identityIsPending = sponsoredAttestationState.isPending;
        const identityName = sponsoredAttestationState.identityName;
        const hasPendingIdentity = pendingIds && Object.keys(pendingIds).length > 0;
        const hasIdentity = hasIdentityInState;
        
        // Determine step 1 status
        let identityStatus;
        let identityDescription;
        
        if (hasIdentity && !identityIsPending) {
            // Identity has been selected and is ready
            identityStatus = 'done';
            identityDescription = identityName ? `Identity: ${identityName}` : "Identity registered";
        } else if (hasIdentity && identityIsPending) {
            // Identity is being provisioned
            identityStatus = 'active';
            identityDescription = identityName ? `Registering ${identityName}...` : "Identity registration in progress";
        } else if (hasPendingIdentity) {
            // Fallback: check pending IDs
            identityStatus = 'active';
            identityDescription = "Identity registration in progress";
        } else {
            // No identity selected yet
            identityStatus = 'active';
            identityDescription = "Register a new VerusID or select an existing one";
        }
        
        steps.push({
            key: 'register-verusid',
            title: "Register VerusID",
            state: identityStatus,
            description: identityDescription,
            onPress: !hasIdentity && !hasPendingIdentity ? showIdentityChoiceModal : undefined
        });

        const isComplete = status === POP_RECEIVED || sponsoredAttestationState.currentStep === 2;
        const canClaim = hasIdentity && !identityIsPending && sponsoredAttestationState.currentStep < 2;
        
        let proofStatus;
        let proofDescription;
        
        if (isComplete) {
            proofStatus = 'done';
            proofDescription = "Proof of Personhood received";
        } else if (canClaim) {
            proofStatus = 'active';
            proofDescription = "Ready to claim your proof";
        } else if (hasIdentity && identityIsPending) {
            proofStatus = 'pending';
            proofDescription = "Waiting for identity registration to complete";
        } else if (hasPendingIdentity) {
            proofStatus = 'pending';
            proofDescription = "Waiting for identity registration to complete";
        } else {
            proofStatus = 'pending';
            proofDescription = "Complete identity registration first";
        }
        
        steps.push({
            key: 'proof-issued',
            title: "Proof Issued",
            state: proofStatus,
            description: proofDescription
        });

        return steps;
    };

    const screenWidth = Dimensions.get('window').width;
    const statusMeta = {
        [VALU_POL_PENDING]: { title: 'Complete verification', body: 'Tap continue to complete your verification.', cta: 'Verify identity' },
        [VALU_POL_READY]: { title: 'Your proof is ready', body: 'Complete verification to receive your Proof of Personhood.', cta: 'Get your proof' },
        [POP_RECEIVED]: { title: 'Proof of Personhood complete', body: 'View your attestations and manage your proof.', cta: 'View my Proof of Personhood' },
        null: { title: 'Start your verification', body: 'Register or select a VerusID to begin your Proof of Personhood verification.', cta: 'Verify identity' }
    };

    // Determine which status/CTA to show based on Redux state
    const getDisplayStatus = () => {
        // Check if user actually has the attestation (not just marked as complete in Redux)
        const actuallyHasAttestation = status === POP_RECEIVED;
        
        if (actuallyHasAttestation) {
            return { ...statusMeta[POP_RECEIVED], show: true };
        }
        
        // Handle stuck state: marked as complete but doesn't have attestation
        if (sponsoredAttestationState.currentStep === 2 && !actuallyHasAttestation) {
            return { 
                title: 'Retry fetching your proof', 
                body: `Your identity was linked successfully. Tap below to retry fetching your Proof of Personhood.`,
                cta: 'Retry Fetch Attestation',
                show: true,
                disabled: false
            };
        }
        
        if (sponsoredAttestationState.currentStep === 1 && sponsoredAttestationState.isPending) {
            return { 
                title: 'Identity registration in progress', 
                body: `${sponsoredAttestationState.identityName} is being registered on the blockchain. You'll be notified when it's ready.`,
                cta: 'Waiting for identity...',
                show: true,
                disabled: true
            };
        }
        if (sponsoredAttestationState.currentStep === 1 && !sponsoredAttestationState.isPending) {
            return { 
                title: 'Retry claiming your proof', 
                body: `${sponsoredAttestationState.identityName} is ready. Tap below to try claiming your Proof of Personhood again.`,
                cta: 'Claim Proof of Personhood',
                show: true,
                disabled: false
            };
        }
        if (statusMeta[status]) {
            return { ...statusMeta[status], show: true };
        }
        return { show: false };
    };

    const displayStatus = getDisplayStatus();
    const isInitialStatus = !displayStatus.show;
    const ctaLabel = isInitialStatus ? 'Register VerusID' : (displayStatus.cta || 'Continue');
    const ctaDisabled = displayStatus.disabled === true;

    const handleMainAction = async () => {
        const actuallyHasAttestation = status === POP_RECEIVED;
        
        if (actuallyHasAttestation) {
            navigateToAttestations();
        } else if (sponsoredAttestationState.currentStep === 2 && !actuallyHasAttestation) {
            // Stuck state: marked as complete but doesn't have attestation - retry fetching
            setLoading(true);
            try {
                const attestationStatus = await ValuProvider.getValuAttestationStatus();
                
                if (attestationStatus?.data) {
                    updateDeeplinkUrl(attestationStatus.data);
                    setLoading(false);
                } else {
                    setLoading(false);
                    createAlert(
                        'Still Processing',
                        'Your attestation is still being generated. Please try again in a moment or you\'ll receive a notification when it\'s ready.',
                        [{ text: 'OK', onPress: () => resolveAlert() }],
                        { cancelable: false }
                    );
                }
            } catch (error) {
                console.error('❌ Error retrying fetch:', error);
                setLoading(false);
                createAlert(
                    'Fetch Error',
                    'Could not fetch your attestation. Error: ' + (error.message || 'Unknown error'),
                    [{ text: 'OK', onPress: () => resolveAlert() }],
                    { cancelable: false }
                );
            }
        } else if (sponsoredAttestationState.currentStep === 1 && !sponsoredAttestationState.isPending) {
            // Identity selected but claim not complete - retry the claim
            await continueProofOfPersonhood({
                identityName: sponsoredAttestationState.identityName,
                identityAddress: sponsoredAttestationState.identityAddress,
                isExisting: true
            });
        } else if (status === VALU_POL_READY || status === VALU_POL_PENDING) {
            const hasPending = await checkForPendingIdentity();
            if (!hasPending && !sponsoredAttestationState.isPending) {
                await loadLinkedIdentities();
                setExistingIdentityModalVisible(true);
            }
        } else {
            // Initial state (status is null) or any other state - show identity choice
            await showIdentityChoiceModal();
        }
    };

    if (loading) {
        return (
            <SafeAreaView style={[Styles.defaultRoot, { backgroundColor: '#FAFAFA' }]}>
                <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                    <AnimatedActivityIndicator style={{ width: 128, height: 128 }} />
                    <Text style={{ marginTop: 20, fontSize: 16, color: Colors.verusDarkGray }}>
                        
                    </Text>
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={[Styles.defaultRoot, { backgroundColor: '#FAFAFA' }]}>
            <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
                {/* Hero Section */}
                <View style={{ paddingHorizontal: 20, paddingTop: 24, paddingBottom: 20, alignItems: 'center' }}>
                    <MaterialCommunityIcons name="shield-check" size={64} color={Colors.verusGreenColor} />
                    <Text style={{ fontSize: 28, fontWeight: '700', color: Colors.primaryColor, marginTop: 16, textAlign: 'center' }}>
                        Claim Your Proof of Personhood
                    </Text>
                    <Text style={{ fontSize: 16, color: Colors.verusDarkGray, marginTop: 8, textAlign: 'center', paddingHorizontal: 20 }}>
                        You've completed KYC verification and are eligible for a sponsored Proof of Personhood attestation.
                    </Text>
                </View>

                {/* Timeline */}
                <View style={{ paddingHorizontal: 20, marginTop: 20 }}>
                    <TimelineList steps={getTimelineSteps()} />
                </View>

                {/* Status Message */}
                {displayStatus.show && (
                    <View style={{ paddingHorizontal: 20, marginTop: 24 }}>
                        <View style={{ backgroundColor: '#E8F5E9', padding: 16, borderRadius: 12, borderLeftWidth: 4, borderLeftColor: Colors.verusGreenColor }}>
                            <Text style={{ fontSize: 18, fontWeight: '600', color: Colors.verusGreenColor, marginBottom: 8 }}>
                                {displayStatus.title}
                            </Text>
                            <Text style={{ fontSize: 14, color: Colors.verusDarkGray }}>
                                {displayStatus.body}
                            </Text>
                        </View>
                    </View>
                )}

                {/* CTA Button */}
                <View style={{ paddingHorizontal: 20, marginTop: 32 }}>
                    <TouchableOpacity
                        onPress={handleMainAction}
                        disabled={loading || showIdentityProvisioningProgress || ctaDisabled}
                        activeOpacity={0.8}
                        style={{
                            borderRadius: 24,
                            height: 56,
                            overflow: 'hidden',
                            position: 'relative',
                            opacity: (loading || showIdentityProvisioningProgress || ctaDisabled) ? 0.5 : 1
                        }}
                    >
                        {!(loading || showIdentityProvisioningProgress || ctaDisabled) && (
                            <Svg
                                width="100%"
                                height="100%"
                                style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
                                pointerEvents="none"
                            >
                                <Defs>
                                    <SvgLinearGradient id="ctaButtonGradient" x1="0" y1="0" x2="1" y2="1">
                                        <Stop offset="0" stopColor="#00C8FF" />
                                        <Stop offset="1" stopColor="#0077A9" />
                                    </SvgLinearGradient>
                                </Defs>
                                <Rect
                                    x="0"
                                    y="0"
                                    width="100%"
                                    height="100%"
                                    rx={24}
                                    ry={24}
                                    fill="url(#ctaButtonGradient)"
                                />
                            </Svg>
                        )}
                        {(loading || showIdentityProvisioningProgress || ctaDisabled) && (
                            <View style={{
                                position: 'absolute',
                                top: 0,
                                left: 0,
                                right: 0,
                                bottom: 0,
                                backgroundColor: '#CFEAF2',
                                borderRadius: 24
                            }} />
                        )}
                        <View style={{
                            height: '100%',
                            justifyContent: 'center',
                            alignItems: 'center'
                        }}>
                            <Text style={{
                                fontSize: 16,
                                fontWeight: '600',
                                color: (loading || showIdentityProvisioningProgress || ctaDisabled) ? '#7DB8C9' : Colors.secondaryColor,
                                textAlign: 'center',
                                includeFontPadding: false,
                                textAlignVertical: 'center'
                            }}>
                                {ctaLabel}
                            </Text>
                        </View>
                    </TouchableOpacity>
                </View>

                {/* Close Button */}
                <View style={{ paddingHorizontal: 20, marginTop: 16 }}>
                    <TouchableOpacity
                        onPress={resetToHome}
                        activeOpacity={0.8}
                        style={{
                            borderRadius: 24,
                            height: 56,
                            backgroundColor: Colors.secondaryColor,
                            borderWidth: 2,
                            borderColor: Colors.primaryColor,
                            justifyContent: 'center',
                            alignItems: 'center'
                        }}
                    >
                        <Text style={{
                            fontSize: 16,
                            fontWeight: '600',
                            color: Colors.primaryColor,
                            textAlign: 'center'
                        }}>
                            Close
                        </Text>
                    </TouchableOpacity>
                </View>
            </ScrollView>

            {/* Identity Choice Modal */}
            <ListSelectionModal
                visible={identityChoiceModalVisible}
                cancel={() => setIdentityChoiceModalVisible(false)}
                title="Choose Identity Option"
                data={[
                    { key: 'new', title: 'Register new VerusID', description: 'Create a new VerusID' },
                    { key: 'existing', title: 'Select existing VerusID', description: 'Use a VerusID you already have' },
                    { key: 'link', title: 'Link identity from blockchain', description: 'Import an existing identity' }
                ]}
                onSelect={(item) => {
                    if (item.key === 'new') continueWithNewValuId();
                    else if (item.key === 'existing') showExistingIdentityModal();
                    else openLinkIdentityModal();
                }}
            />

            {/* Existing Identity Modal */}
            <ListSelectionModal
                visible={existingIdentityModalVisible}
                cancel={() => setExistingIdentityModalVisible(false)}
                title="Select VerusID"
                showSearch={true}
                searchPlaceholder="Search identities"
                data={Object.keys(sortedIds).map(iAddress => ({
                    key: iAddress,
                    title: sortedIds[iAddress]
                }))}
                onSelect={(item) => selectExistingIdentity(item.key)}
                keyExtractor={(item) => item.key}
            />

            {/* Pending Identity Modal */}
            <ListSelectionModal
                visible={showPendingIdentityModal}
                cancel={() => setShowPendingIdentityModal(false)}
                title="Pending Identity"
                data={[
                    { key: 'link', title: `Link ${pendingIdentityInfo?.fqn || 'pending identity'}`, description: 'Complete identity registration' }
                ]}
                onSelect={linkPendingIdentity}
            />
        </SafeAreaView>
    );
};

const mapStateToProps = (state) => ({
    activeAccount: state.authentication.activeAccount
});

export default connect(mapStateToProps)(GetSponsoredAttestation);
