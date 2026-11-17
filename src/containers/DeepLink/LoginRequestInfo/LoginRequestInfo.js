/*
  LoginRequestInfo
  - Redesigned 2026-02-03: Align login request UI with IdentityUpdateRequestInfo layout.
    - Removed large VerusID logo and legacy list rows
    - Added requester card, connector, choose-identity card, and compact intent card
    - Added summary + permissions section with status styling
    - Disabled Continue until all permissions are agreed, with clear status messaging
  - Updated 2026-02-03: Clarified copy when no additional permissions are required.
    - Reworded helper/empty state to focus on authentication, not data access
    - Adjusted status labels and messages to avoid "accept" confusion
  - Updated 2026-02-03: Neutral status styling for "No action needed".
    - Uses gray status pill and icon to avoid green success emphasis
  - Updated 2026-02-03: Simplified auth-only mode.
    - When no additional permissions are required, show a minimal clean UI
    - Reduces cognitive load for simple authentication requests
*/
import React, { useMemo, useState, useEffect } from 'react';
import { SafeAreaView, ScrollView, TouchableOpacity, View, StyleSheet, Platform, StatusBar } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { primitives } from 'verusid-ts-client';
import { Portal, Text } from 'react-native-paper';
import Button from '../../../components/Button';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import VerusIdDetailsModal from '../../../components/VerusIdDetailsModal/VerusIdDetailsModal';
import { getIdentity, getFriendlyNameMap } from '../../../utils/api/channels/verusid/callCreators';
import { unixToDate } from '../../../utils/math';
import { useDispatch, useSelector } from 'react-redux';
import Colors from '../../../globals/colors';
import { openAuthenticateUserModal } from '../../../actions/actions/sendModal/dispatchers/sendModal';
import { AUTHENTICATE_USER_SEND_MODAL, SEND_MODAL_USER_ALLOWLIST } from '../../../utils/constants/sendModal';
import AnimatedActivityIndicatorBox from '../../../components/AnimatedActivityIndicatorBox';
import GradientButton from '../../../components/GradientButton';
import { getSystemNameFromSystemId } from '../../../utils/CoinData/CoinData';
import { Buffer } from 'buffer';
import { createAlert, resolveAlert } from '../../../actions/actions/alert/dispatchers/alert';
import { CoinDirectory } from '../../../utils/CoinData/CoinDirectory';
import { addCoin, addKeypairs, setUserCoins } from '../../../actions/actionCreators';
import { refreshActiveChainLifecycles } from '../../../actions/actions/intervals/dispatchers/lifecycleManager';
import { useObjectSelector } from '../../../hooks/useObjectSelector';
import {scopeSessionAction} from '../../../actions/actions/updates/sessionRequests';
import { checkIfAttestationProvision as checkAttestationProvision } from '../../../utils/attestations/downloadAttestation';
import { LOGIN_PERMISSION_TYPES, PERMISSION_STATUS } from '../../../utils/constants/loginPermissions';
import { setPermissionAgreed } from '../../../actions/actions/deeplink/creators/passthroughData';
import VerusIdAtIcon from '../../../images/customIcons/verusid-at-icon.svg';

const Connector = () => {
  return (
    <View style={styles.connectorContainer}>
      <View style={styles.connectorLine} />
      <View style={styles.connectorArrow} />
    </View>
  );
};

const LoginRequestInfo = props => {
  const insets = useSafeAreaInsets();
  const { deeplinkData, sigtime, cancel, signerFqn } = props
  const [req, setReq] = useState(new primitives.LoginConsentRequest(deeplinkData))
  const [loading, setLoading] = useState(false)
  const [verusIdDetailsModalProps, setVerusIdDetailsModalProps] = useState(null)
  const [sigDateString, setSigDateString] = useState(unixToDate(sigtime))
  const [waitingForSignin, setWaitingForSignin] = useState(false)
  
  // Redux state
  const accounts = useObjectSelector(state => state.authentication.accounts)
  const signedIn = useSelector(state => state.authentication.signedIn)
  const passthrough = useSelector((state) => state.deeplink.passthrough);
  const sendModalType = useSelector(state => state.sendModal.type)
  const activeAccount = useObjectSelector(state => state.authentication.activeAccount);
  const activeCoinList = useObjectSelector(state => state.coins.activeCoinList);
  
  const { system_id, signing_id, challenge } = req
  const chain_id = getSystemNameFromSystemId(system_id)
  const rootSystemAdded = useSelector(
    state =>
      state.coins.activeCoinsForUser &&
      state.coins.activeCoinsForUser.find(x => x.id === chain_id) != null,
  );
  
  // Component state
  const [prevRootSystemAdded, setPrevRootSystemAdded] = useState(rootSystemAdded);
  const [permissions, setExtraPermissions] = useState(null);
  const [isAttestationProvision, setIsAttestationProvision] = useState(false);
  
  const dispatch = useDispatch()
  const isTestnet = activeAccount ? Object.keys(activeAccount.testnetOverrides).length > 0 : false;
  const sessionEpoch = useObjectSelector(
    state => state.authentication.sessionEpoch,
  );

  let mainLoginMessage = '';

  if (challenge.redirect_uris && challenge.redirect_uris.length > 0) {
    mainLoginMessage = `${signerFqn} is requesting login with VerusID`
  } else {
    if (passthrough?.fqnToAutoLink) {
      mainLoginMessage = `VerusID from ${signerFqn} now ready to link`
    } else {
      mainLoginMessage = `Would you like to request a VerusID from ${signerFqn}?`
    }
  }

  const getVerusId = async (chain, iAddrOrName) => {
    const identity = await getIdentity(CoinDirectory.getBasicCoinObj(chain).system_id, iAddrOrName);

    if (identity.error) throw new Error(identity.error.message);
    else return identity.result;
  }

  const openVerusIdDetailsModal = (chain, iAddress) => {
    setVerusIdDetailsModalProps({
      loadVerusId: () => getVerusId(chain, iAddress),
      visible: true,
      animationType: 'slide',
      cancel: () => setVerusIdDetailsModalProps(null),
      loadFriendlyNames: async () => {
        try {
          const identityObj = await getVerusId(chain, iAddress);
          return getFriendlyNameMap(CoinDirectory.getBasicCoinObj(chain).system_id, identityObj);
        } catch (e) {
          return {
            ['i5w5MuNik5NtLcYmNzcvaoixooEebB6MGV']: 'VRSC',
            ['iJhCezBExJHvtyH3fGhNnt2NhU4Ztkf2yq']: 'VRSCTEST',
          };
        }
      },
      iAddress,
      chain
    })
  }

  useEffect(() => {
    const rootSystemJustAdded = prevRootSystemAdded === false && rootSystemAdded === true;
    setPrevRootSystemAdded(rootSystemAdded);

    // Profile initialization loads coins before sign-in finishes. Resume once,
    // after the authentication dialog has completed and closed.
    if (
      signedIn &&
      sendModalType !== AUTHENTICATE_USER_SEND_MODAL &&
      (waitingForSignin || rootSystemJustAdded)
    ) {
      setWaitingForSignin(false);
      handleContinue()
    }
  }, [signedIn, waitingForSignin, rootSystemAdded, prevRootSystemAdded, sendModalType]);

  useEffect(() => {
    setReq(new primitives.LoginConsentRequest(deeplinkData))
    // Reset state when deeplink data changes
    setIsAttestationProvision(false)
    setExtraPermissions(null)
  }, [deeplinkData]);

  useEffect(() => {
    setSigDateString(unixToDate(sigtime))
  }, [sigtime]);

  useEffect(() => {
    if (sendModalType != AUTHENTICATE_USER_SEND_MODAL) {
      setLoading(false);
    } else setLoading(true)
  }, [sendModalType]);

  // Helper function to handle authentication for unauthenticated users
  const authenticateUser = (actionDescription) => {
    setWaitingForSignin(true);
    const coinObj = CoinDirectory.findCoinObj(chain_id);
    
    const allowList = coinObj.testnet 
      ? accounts.filter(x => x.testnetOverrides && x.testnetOverrides[coinObj.mainnet_id] === coinObj.id)
      : accounts.filter(x => !(x.testnetOverrides && x.testnetOverrides[coinObj.id] != null));

    if (allowList.length > 0) {
      const data = {
        [SEND_MODAL_USER_ALLOWLIST]: allowList
      }
      openAuthenticateUserModal(data);
    } else {
      createAlert(
        "Cannot continue",
        `No ${coinObj.testnet ? 'testnet' : 'mainnet'} profiles found, cannot ${actionDescription}.`
      );
    }
  };

  const buildAlert = (request) => {
    if (request.agreed) return;

    // Check if user needs to be authenticated for any action
    const requiresAuth = request.downloadRequired || request.viewAttestation || 
                        request.attestationToAccept || request.openProfile || request.signmessage;

    if (requiresAuth && !signedIn) {
      const actionMap = {
        downloadRequired: 'download attestation',
        viewAttestation: 'view attestation',
        attestationToAccept: 'accept attestation',
        openProfile: 'access profile data',
        signmessage: 'sign message'
      };
      
      // Find the specific action requiring authentication
      const action = Object.keys(actionMap).find(key => request[key]);
      authenticateUser(actionMap[action] || 'proceed');
      return;
    }

    if (request.downloadRequired && !request.downloaded) {
      // Handle download case - navigate to LoginReceiveAttestation with download URL
      props.navigation.navigate("LoginReceiveAttestation", {
        fromService: false,
        downloadUrl: req.challenge.redirect_uris.find(
          uri => uri.vdxfkey === primitives.ATTESTATION_PROVISION_URL.vdxfid
        )?.uri,
        signerFqn
      });
      return;
    }

    // Handle other navigation cases
    const navigationConfigs = {
      viewAttestation: "LoginShareAttestation",
      attestationToAccept: "LoginReceiveAttestation", 
      openProfile: "PersonalSelectData",
      signmessage: "LoginSignDataRequest"
    };

    for (const [key, screenName] of Object.entries(navigationConfigs)) {
      if (request[key]) {
        const navigationParams = {
          fromService: false,
          signerFqn
        };
        
        // Add index and additional data for all requests
        navigationParams.permissionIndex = request.index;
        navigationParams.permissionType = request.permissionType;
        
        if (key === 'signmessage' && request.endorsement) {
          navigationParams.endorsementData = request.endorsement;
        }
        
        props.navigation.navigate(screenName, navigationParams);
        return;
      }
    }

    // For simple agreements that don't require navigation
    return createAlert(
      request.title,
      request.data,
      [
        {
          text: 'DECLINE',
          onPress: () => resolveAlert(false),
          style: 'cancel',
        },
        {
          text: 'ACCEPT', onPress: () => {
            // Update permission using Redux passthrough system
            dispatch(setPermissionAgreed(
              passthrough,
              request.index,
              request.permissionType,
              { data: request.data }
            ));
            resolveAlert(true)
          }
        },
      ],
      { cancelable: true });
  }

  useEffect(() => {
    if (req && req.challenge) {
      // Check if this is an attestation provision request (download scenario)
      if (checkAttestationProvision(req.challenge)) {
        setIsAttestationProvision(true);

        // Create a permission for the attestation download
        const provisioningTitle = req.challenge.provisioning_info[0].data;
        const downloadPermission = [{
          index: 0,
          data: `Download ${provisioningTitle}`,
          title: provisioningTitle,
          permissionType: LOGIN_PERMISSION_TYPES.DOWNLOAD_REQUIRED,
          downloadRequired: true,
          downloaded: false,
          agreed: false
        }];

        setExtraPermissions(downloadPermission);
        return;
      }

      // Handle regular login permissions - loop through subject array instead of requested_access
      const loginTemp = [];
      const { requested_access, attestations, subject } = req.challenge;

      // Handle simple identity view requests
      if (requested_access.length === 1 && requested_access.some(value => value.vdxfkey === primitives.IDENTITY_VIEW.vdxfid)) {
        if (attestations && attestations.length > 0) {
          loginTemp.push({ 
            index: 0,
            data: "Accept attestation", 
            title: "Attestation Provisioning Request", 
            permissionType: LOGIN_PERMISSION_TYPES.ATTESTATION_TO_ACCEPT,
            attestationToAccept: true, 
            agreed: false 
          });
        } else {
          setExtraPermissions([]);
          return;
        }
      } else if (subject && subject.length > 0) {
        // Process each subject item directly
        subject.forEach((subjectItem, index) => {
          const { vdxfkey } = subjectItem;
          primitives.ATTESTATION_READ_REQUEST = {
            vdxfid: "iNqLaiDJjcADGCvXcQZnPqwTqMXzQbDCFu"};
          console.log(`Processing subject item with vdxfkey: ${vdxfkey}`);
          let permissionData = null;

          // Handle different subject types
          if (vdxfkey === primitives.IDENTITY_AGREEMENT.vdxfid) {
            permissionData = {
              data: subjectItem.data,
              title: "Agreement to accept",
              permissionType: LOGIN_PERMISSION_TYPES.DOWNLOAD_REQUIRED // Generic agreement
            };
          } else if (vdxfkey === primitives.ATTESTATION_READ_REQUEST.vdxfid) {
            permissionData = {
              data: "Agree to share attestation data",
              title: "Attestation View Request",
              permissionType: LOGIN_PERMISSION_TYPES.VIEW_ATTESTATION,
              viewAttestation: true
            };
          } else if (vdxfkey === primitives.PROFILE_DATA_VIEW_REQUEST.vdxfid) {
            permissionData = {
              data: "Agree to share profile data",
              title: "Personal Data Input Request",
              permissionType: LOGIN_PERMISSION_TYPES.OPEN_PROFILE,
              openProfile: true
            };
          } else if (vdxfkey === primitives.IDENTITY_SIGNDATA_REQUEST.vdxfid) {
            try {
              console.log('Processing sign data request for subject item:', subjectItem);
              const newEndorsement = new primitives.Endorsement();
              newEndorsement.fromBuffer(Buffer.from(subjectItem.data, 'base64'));
              
              permissionData = {
                data: newEndorsement.message,
                endorsement: newEndorsement,
                title: `Signature request ${index + 1}`,
                permissionType: LOGIN_PERMISSION_TYPES.SIGN_MESSAGE,
                signmessage: true
              };
            } catch (e) {
              console.error('Failed to parse endorsement:', e);
              permissionData = {
                data: "Invalid endorsement data",
                title: `Signature request ${index + 1}`,
                permissionType: LOGIN_PERMISSION_TYPES.SIGN_MESSAGE,
                signmessage: true
              };
            }
          }
          
          if (permissionData) {
            loginTemp.push({ 
              index,
              vdxfkey,
              ...permissionData, 
              agreed: false 
            });
          }
        });
      } else {
        // Handle other requested access types that don't have subject items
        requested_access.forEach((access, index) => {
          const { vdxfkey } = access;

          // Skip IDENTITY_VIEW and LOGIN_CONSENT_PERSONALINFO_WEBHOOK_VDXF_KEY
          if (vdxfkey === primitives.IDENTITY_VIEW.vdxfid || 
              vdxfkey === primitives.LOGIN_CONSENT_PERSONALINFO_WEBHOOK_VDXF_KEY.vdxfid) {
            return;
          }

          const accessTypeMap = {
            [primitives.ATTESTATION_READ_REQUEST.vdxfid]: {
              data: "Agree to share attestation data",
              title: "Attestation View Request",
              permissionType: LOGIN_PERMISSION_TYPES.VIEW_ATTESTATION,
              viewAttestation: true
            },
            [primitives.PROFILE_DATA_VIEW_REQUEST.vdxfid]: {
              data: "Agree to share profile data",
              title: "Personal Data Input Request",
              permissionType: LOGIN_PERMISSION_TYPES.OPEN_PROFILE,
              openProfile: true
            }
          };

          const permissionData = accessTypeMap[vdxfkey];
          
          if (permissionData) {
            loginTemp.push({ 
              index,
              vdxfkey,
              ...permissionData, 
              agreed: false 
            });
          }
        });
      }

      if (loginTemp.length > 0) {
        setExtraPermissions(loginTemp);
      } else {
        setExtraPermissions([]);
      }
    }
  }, [req]);

  // Handle permission updates from passthrough data (Redux-based permission system)
  // When users complete actions in other screens, they dispatch permission updates via Redux
  // This effect automatically updates the UI to reflect completed permissions
  useEffect(() => {
    if (passthrough?.permissions && permissions) {
      let hasUpdates = false;
      const updatedPermissions = permissions.map(permission => {
        // Only update if permission is not already agreed
        if (!permission.agreed) {
          // Check if this permission has been agreed to by index
          const passthroughPermission = passthrough.permissions[permission.index];
          
          if (passthroughPermission?.status === PERMISSION_STATUS.AGREED) {
            console.log(`Permission ${permission.index} (${permission.permissionType}) was agreed`);
            hasUpdates = true;
            
            // Special handling for download permissions
            if (permission.downloadRequired) {
              return { ...permission, agreed: true, downloaded: true };
            } else {
              return { ...permission, agreed: true };
            }
          }
        }

        return permission;
      });

      if (hasUpdates) {
        setExtraPermissions(updatedPermissions);
      }
    }
  }, [passthrough?.permissions]);

  const permissionsLoaded = permissions != null;
  const extraPermissions = permissions || [];
  const hasActionablePermissions = extraPermissions.length > 0;
  const hasIdentityViewPermission = Boolean(
    challenge &&
      challenge.requested_access &&
      challenge.requested_access.some(value => value.vdxfkey === primitives.IDENTITY_VIEW.vdxfid)
  );
  const remainingActions = permissionsLoaded
    ? extraPermissions.filter(permission => !permission.agreed).length
    : 0;
  const totalPermissions = extraPermissions.length + (hasIdentityViewPermission ? 1 : 0);
  const isReady = permissionsLoaded && remainingActions === 0;
  const statusLabel = !permissionsLoaded
    ? 'Loading permissions'
    : !hasActionablePermissions
    ? 'No action needed'
    : isReady
    ? 'All set'
    : `${remainingActions} remaining`;
  const statusVariant = !permissionsLoaded
    ? 'pending'
    : !hasActionablePermissions
    ? 'neutral'
    : isReady
    ? 'ready'
    : 'pending';
  const headerSubtitle = !permissionsLoaded
    ? 'Loading permissions'
    : hasActionablePermissions
    ? 'Review the permissions before continuing'
    : 'No additional permissions are required for this login';
  const permissionsTitle = hasActionablePermissions ? 'Permissions' : 'Authentication';
  const permissionsHelper = !permissionsLoaded
    ? 'Loading permissions...'
    : hasActionablePermissions
    ? 'Review and accept each permission to continue'
    : 'This login uses your chosen identity to authenticate you. No additional data is requested.';
  const basePermissionTitle = 'Authenticate with your identity';
  const basePermissionSubtitle = hasActionablePermissions
    ? 'Required for login'
    : 'Proves you control the chosen identity';
  const statusMessage = !permissionsLoaded
    ? 'Loading permissions...'
    : hasActionablePermissions
    ? isReady
      ? 'All permissions accepted. You can continue.'
      : 'Complete the permissions above to enable Continue.'
    : 'Authentication only. Continue to choose identity.';
  const requesterLabel = signerFqn || 'Unknown requester';
  const canOpenSignerModal = Boolean(chain_id && signing_id);
  const intentConfig = useMemo(() => {
    const provisioningTitle = challenge?.provisioning_info?.[0]?.data;

    if (isAttestationProvision) {
      return {
        icon: 'cloud-download',
        title: 'Download available',
        description: `${requesterLabel} has shared content with you`,
        helper: provisioningTitle
          ? `Tap the download icon below to view ${provisioningTitle}`
          : null,
      };
    }

    if (challenge?.redirect_uris && challenge.redirect_uris.length > 0) {
      return {
        icon: 'account-key',
        title: 'Login request',
        description: `${requesterLabel} is requesting login with VerusID`,
      };
    }

    if (passthrough?.fqnToAutoLink) {
      return {
        icon: 'link',
        title: 'Ready to link',
        description: `VerusID from ${requesterLabel} now ready to link`,
      };
    }

    if (challenge?.attestations && challenge.attestations.length > 0) {
      return {
        icon: 'certificate',
        title: 'Attestation request',
        description: `Would you like to accept an attestation from ${requesterLabel}?`,
      };
    }

    if (challenge?.requested_access && challenge.requested_access.length > 0) {
      return {
        icon: 'share-variant',
        title: 'Share request',
        description: `Would you like to share attestation information from ${requesterLabel}?`,
      };
    }

    return {
      icon: 'account-plus',
      title: 'VerusID request',
      description: `Would you like to request a VerusID from ${requesterLabel}?`,
    };
  }, [challenge, isAttestationProvision, passthrough?.fqnToAutoLink, requesterLabel]);

  const getPermissionIconConfig = request => {
    if (request.downloadRequired && !request.downloaded) {
      return {
        iconName: 'download',
        iconColor: Colors.secondaryColor,
        iconBackgroundColor: Colors.verusGreenColor,
        isDownloadPending: true,
      };
    }

    if (request.agreed) {
      return {
        iconName: 'check',
        iconColor: Colors.secondaryColor,
        iconBackgroundColor: Colors.verusGreenColor,
        isDownloadPending: false,
      };
    }

    return {
      iconName: 'check',
      iconColor: Colors.secondaryColor,
      iconBackgroundColor: '#BFBFBF',
      isDownloadPending: false,
    };
  };

  const addRootSystem = async () => {
    setLoading(true)
    const sessionScope = {
      sessionScoped: true,
      accountHash: activeAccount.accountHash,
      sessionEpoch,
    };
    const requestContext = {sessionScope};

    try {
      const fullCoinData = CoinDirectory.findCoinObj(chain_id)

      dispatch(
        await addKeypairs(
          fullCoinData,
          activeAccount.keys,
          activeAccount.keyDerivationVersion == null
            ? 0
            : activeAccount.keyDerivationVersion,
          requestContext,
        ),
      );

      const addCoinAction = await addCoin(
        fullCoinData,
        activeCoinList,
        activeAccount.id,
        fullCoinData.compatible_channels,
        requestContext,
      );

      if (addCoinAction) {
        dispatch(addCoinAction);

        const setUserCoinsAction = setUserCoins(
          addCoinAction.activeCoinList,
          activeAccount.id,
        );
        dispatch(scopeSessionAction(setUserCoinsAction, sessionScope));
  
        refreshActiveChainLifecycles(setUserCoinsAction.payload.activeCoinsForUser);
      } else {
        createAlert("Error", "Error adding coin")
      }
    } catch (e) {
      createAlert("Error", e.message)
    }

    setLoading(false)
  }

  const canAddRootSystem = () => {
    return createAlert(
      `Add ${chain_id}?`,
      `To complete this login request, you need to add the ${chain_id} currency to your wallet. Would you like to do so now?`,
      [
        {
          text: 'Cancel',
          onPress: () => resolveAlert(false),
          style: 'cancel',
        },
        { text: 'Yes', onPress: () => resolveAlert(true) },
      ],
      { cancelable: true }
    )
  }

  const tryAddRootSystem = async () => {
    if (await canAddRootSystem()) {
      return addRootSystem()
    }
  }

  const handleContinue = async () => {
    if (!isReady) {
      createAlert(
        "Complete permissions",
        "Review and accept each permission above before continuing."
      );
      return;
    }

    if (signedIn) {
      const coinObj = CoinDirectory.findCoinObj(chain_id);
      
      if (!!coinObj.testnet != isTestnet) {
        createAlert(
          "Incorrect profile type",
          `Please login to a ${coinObj.testnet ? 'testnet' : 'mainnet'} profile to use this login request.`
        );
        return;
      }
      
      if (!rootSystemAdded) {
        return tryAddRootSystem()
      } else {
        props.navigation.navigate('LoginRequestIdentity', {});
      }
    } else {
      setWaitingForSignin(true);
      const coinObj = CoinDirectory.findCoinObj(chain_id);
      
      const allowList = coinObj.testnet 
        ? accounts.filter(x => x.testnetOverrides && x.testnetOverrides[coinObj.mainnet_id] === coinObj.id)
        : accounts.filter(x => !(x.testnetOverrides && x.testnetOverrides[coinObj.id] != null));

      if (allowList.length > 0) {
        const data = {
          [SEND_MODAL_USER_ALLOWLIST]: allowList
        }
        openAuthenticateUserModal(data);
      } else {
        createAlert(
          "Cannot continue",
          `No ${coinObj.testnet ? 'testnet' : 'mainnet'} profiles found, cannot respond to ${coinObj.testnet ? 'testnet' : 'mainnet'} login request.`
        );
      }
    }
  };

  // Simple auth-only mode: minimal UI when no permissions need review
  const renderSimpleMode = () => (
    <SafeAreaView style={styles.container}>
      <Portal>
        {verusIdDetailsModalProps != null && (
          <VerusIdDetailsModal {...verusIdDetailsModalProps} />
        )}
      </Portal>
      <View style={styles.simpleContent}>
        <View style={styles.simpleHeader}>
          <View style={styles.simpleIconContainer}>
            <MaterialCommunityIcons name="account-key" size={32} color={Colors.primaryColor} />
          </View>
          <Text style={styles.simpleTitle}>Login request</Text>
          <Text style={styles.simpleSubtitle}>
            {requesterLabel} wants to verify your identity
          </Text>
        </View>

        <TouchableOpacity
          style={styles.simpleRequesterCard}
          onPress={canOpenSignerModal ? () => openVerusIdDetailsModal(chain_id, signing_id) : undefined}
          activeOpacity={canOpenSignerModal ? 0.7 : 1}
        >
          <View style={styles.simpleRequesterRow}>
            <MaterialCommunityIcons name="shield-check" size={20} color={Colors.verusGreenColor} />
            <Text style={styles.simpleRequesterName}>{requesterLabel}</Text>
            {canOpenSignerModal && (
              <MaterialCommunityIcons name="chevron-right" size={20} color={Colors.verusDarkGray} />
            )}
          </View>
          <View style={styles.simpleChipRow}>
            <View style={styles.simpleChip}>
              <Text style={styles.simpleChipText}>{chain_id}</Text>
            </View>
            <View style={styles.simpleChip}>
              <Text style={styles.simpleChipText}>{sigDateString}</Text>
            </View>
          </View>
        </TouchableOpacity>

        <View style={styles.simpleInfoRow}>
          <MaterialCommunityIcons name="information-outline" size={16} color="#6B7280" />
          <Text style={styles.simpleInfoText}>
            No additional data will be shared
          </Text>
        </View>
      </View>

      <View style={[styles.footer, { paddingBottom: Math.max(16, insets.bottom + 16) }]}>
        <View style={styles.ctaCol}>
          <Button
            mode="contained"
            onPress={() => cancel()}
            style={styles.secondaryCta}
            contentStyle={styles.secondaryCtaContent}
            uppercase={false}
            buttonColor="#EBF6FF"
            textColor={Colors.primaryColor}
            labelStyle={styles.secondaryCtaLabel}
          >
            Cancel
          </Button>
        </View>
        <View style={styles.ctaCol}>
          <GradientButton
            onPress={() => handleContinue()}
            style={styles.primaryCta}
          >
            Choose identity
          </GradientButton>
        </View>
      </View>
    </SafeAreaView>
  );

  // Detailed mode: full UI with permissions review
  const renderDetailedMode = () => (
    <SafeAreaView style={styles.container}>
      <Portal>
        {verusIdDetailsModalProps != null && (
          <VerusIdDetailsModal {...verusIdDetailsModalProps} />
        )}
      </Portal>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.mainTitle}>Request details</Text>
          <Text style={styles.subtitle}>{headerSubtitle}</Text>
        </View>

        <TouchableOpacity
          style={styles.requesterCard}
          onPress={canOpenSignerModal ? () => openVerusIdDetailsModal(chain_id, signing_id) : undefined}
          activeOpacity={canOpenSignerModal ? 0.7 : 1}
        >
          <View style={styles.requesterHeaderRow}>
            <View style={styles.requesterIconContainer}>
              <MaterialCommunityIcons name="shield-check" size={28} color={Colors.verusGreenColor} />
            </View>
            <View style={styles.requesterTextContainer}>
              <Text style={styles.requesterLabel}>Request from</Text>
              <Text style={styles.requesterName}>{requesterLabel}</Text>
            </View>
            {canOpenSignerModal && (
              <MaterialCommunityIcons name="chevron-right" size={24} color={Colors.verusDarkGray} />
            )}
          </View>
          <View style={styles.requesterDetailsRow}>
            <View style={styles.chipContainer}>
              <Text style={styles.chipText}>{chain_id}</Text>
            </View>
            <View style={styles.chipContainer}>
              <Text style={styles.chipText}>{sigDateString}</Text>
            </View>
          </View>
        </TouchableOpacity>

        <View style={styles.intentCard}>
          <View style={styles.intentRow}>
            <View style={styles.intentIconContainer}>
              <MaterialCommunityIcons name={intentConfig.icon} size={20} color={Colors.verusGreenColor} />
            </View>
            <View style={styles.intentTextContainer}>
              <Text style={styles.intentTitle}>{intentConfig.title}</Text>
              <Text style={styles.intentSubtitle}>{intentConfig.description}</Text>
              {intentConfig.helper ? (
                <Text style={styles.intentHelper}>{intentConfig.helper}</Text>
              ) : null}
            </View>
          </View>
        </View>

        <Connector />

        <View style={styles.targetCard}>
          <View style={styles.targetRow}>
            <View style={styles.targetIconContainer}>
              <VerusIdAtIcon width={24} height={24} fill="#3165D4" />
            </View>
            <View style={styles.targetInfo}>
              <Text style={styles.targetLabel}>Identity</Text>
              <Text style={styles.targetName}>Choose identity</Text>
            </View>
          </View>
        </View>

        <View style={styles.summaryCard}>
          <View style={styles.summaryHeader}>
            <Text style={styles.summaryTitle}>Summary</Text>
            <View
              style={[
                styles.statusPill,
                statusVariant === 'ready'
                  ? styles.statusPillReady
                  : statusVariant === 'neutral'
                  ? styles.statusPillNeutral
                  : styles.statusPillPending,
              ]}
            >
              <MaterialCommunityIcons
                name={statusVariant === 'ready' ? 'check-circle' : 'clock-outline'}
                size={14}
                color={
                  statusVariant === 'ready'
                    ? Colors.verusGreenColor
                    : statusVariant === 'neutral'
                    ? '#6B7280'
                    : '#B45309'
                }
              />
              <Text
                style={[
                  styles.statusPillText,
                  statusVariant === 'ready'
                    ? styles.statusPillTextReady
                    : statusVariant === 'neutral'
                    ? styles.statusPillTextNeutral
                    : styles.statusPillTextPending,
                ]}
              >
                {statusLabel}
              </Text>
            </View>
          </View>
          <View style={styles.summaryRow}>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryCount}>{totalPermissions}</Text>
              <Text style={styles.summaryLabel}>Permissions</Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryCount}>{remainingActions}</Text>
              <Text style={styles.summaryLabel}>Actions required</Text>
            </View>
          </View>
        </View>

        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionHeaderLeft}>
              <MaterialCommunityIcons name="shield-account-outline" size={20} color="#666" />
              <Text style={styles.sectionTitle}>{permissionsTitle}</Text>
            </View>
          </View>
          <Text style={styles.sectionHelper}>
            {permissionsHelper}
          </Text>
          <View style={styles.sectionContent}>
            {hasIdentityViewPermission && (
              <View style={styles.permissionItem}>
                <View style={styles.permissionLeft}>
                  <Text style={styles.permissionTitle}>{basePermissionTitle}</Text>
                  <Text style={styles.permissionSubtitle}>{basePermissionSubtitle}</Text>
                </View>
                <View style={[styles.permissionStatusIcon, styles.permissionStatusIncluded]}>
                  <MaterialCommunityIcons name="check" size={14} color={Colors.verusGreenColor} />
                </View>
              </View>
            )}
            {extraPermissions.map((request, index) => {
              const { iconName, iconColor, iconBackgroundColor, isDownloadPending } = getPermissionIconConfig(request);
              return (
                <TouchableOpacity
                  key={`${request.permissionType}-${request.index ?? index}`}
                  onPress={() => buildAlert(request)}
                  style={[
                    styles.permissionItem,
                    isDownloadPending && styles.permissionItemHighlight,
                  ]}
                  activeOpacity={0.7}
                >
                  <View style={styles.permissionLeft}>
                    <Text style={styles.permissionTitle}>{request.title}</Text>
                    <Text style={styles.permissionSubtitle}>
                      {request.downloadRequired && !request.downloaded
                        ? `Download the ${request.title} details.`
                        : `View the ${request.title} details.`}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.permissionStatusIcon,
                      { backgroundColor: iconBackgroundColor },
                      isDownloadPending && styles.permissionStatusElevated,
                    ]}
                  >
                    <MaterialCommunityIcons name={iconName} size={16} color={iconColor} />
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={styles.permissionStatusRow}>
          <MaterialCommunityIcons
            name={isReady ? 'check-circle' : 'alert-circle-outline'}
            size={16}
            color={isReady ? Colors.verusGreenColor : '#9A3412'}
          />
          <Text style={styles.permissionStatusMessage}>
            {statusMessage}
          </Text>
        </View>

        <View style={{ height: 24 }} />
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(16, insets.bottom + 16) }]}>
        <View style={styles.ctaCol}>
          <Button
            mode="contained"
            onPress={() => cancel()}
            style={styles.secondaryCta}
            contentStyle={styles.secondaryCtaContent}
            uppercase={false}
            buttonColor="#EBF6FF"
            textColor={Colors.primaryColor}
            labelStyle={styles.secondaryCtaLabel}
          >
            Cancel
          </Button>
        </View>
        <View style={styles.ctaCol}>
          <GradientButton
            onPress={() => handleContinue()}
            style={styles.primaryCta}
            disabled={!isReady}
          >
            Continue
          </GradientButton>
        </View>
      </View>
    </SafeAreaView>
  );

  if (loading) {
    return <AnimatedActivityIndicatorBox />;
  }

  // Show simple mode for auth-only requests, detailed mode otherwise
  return permissionsLoaded && !hasActionablePermissions
    ? renderSimpleMode()
    : renderDetailedMode();
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight || 24 : 0,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  header: {
    marginBottom: 20,
    marginTop: 8,
  },
  mainTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    letterSpacing: -0.2,
    color: '#1A1A1A',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  requesterCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E8E8E8',
    zIndex: 2,
  },
  requesterHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  requesterIconContainer: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  requesterTextContainer: {
    flex: 1,
  },
  requesterLabel: {
    fontSize: 12,
    color: '#666',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  requesterName: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1A1A1A',
  },
  requesterDetailsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chipContainer: {
    backgroundColor: '#F5F5F5',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  chipText: {
    fontSize: 11,
    color: '#666',
    fontWeight: '600',
  },
  intentCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E8E8E8',
  },
  intentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  intentIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    backgroundColor: '#ECFDF3',
  },
  intentTextContainer: {
    flex: 1,
  },
  intentTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 4,
  },
  intentSubtitle: {
    fontSize: 13,
    color: '#444',
    lineHeight: 18,
  },
  intentHelper: {
    fontSize: 12,
    color: '#777',
    marginTop: 4,
  },
  connectorContainer: {
    alignItems: 'center',
    height: 40,
    justifyContent: 'center',
    zIndex: 1,
    marginTop: -2,
    marginBottom: -2,
  },
  connectorLine: {
    width: 2,
    height: '100%',
    backgroundColor: '#E0E0E0',
    position: 'absolute',
  },
  connectorArrow: {
    width: 0,
    height: 0,
    backgroundColor: 'transparent',
    borderStyle: 'solid',
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderBottomWidth: 0,
    borderTopWidth: 8,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: '#E0E0E0',
    position: 'absolute',
    bottom: 0,
  },
  targetCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#E8E8E8',
    zIndex: 2,
  },
  targetRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  targetIconContainer: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  targetInfo: {
    flex: 1,
  },
  targetLabel: {
    fontSize: 12,
    color: '#666',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  targetName: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1A1A1A',
  },
  summaryCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E8E8E8',
  },
  summaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  summaryTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
  },
  statusPillReady: {
    backgroundColor: '#ECFDF3',
    borderColor: '#A7F3D0',
  },
  statusPillPending: {
    backgroundColor: '#FFF7ED',
    borderColor: '#FED7AA',
  },
  statusPillNeutral: {
    backgroundColor: '#F3F4F6',
    borderColor: '#E5E7EB',
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: '700',
  },
  statusPillTextReady: {
    color: Colors.verusGreenColor,
  },
  statusPillTextPending: {
    color: '#B45309',
  },
  statusPillTextNeutral: {
    color: '#6B7280',
  },
  summaryRow: {
    flexDirection: 'row',
    gap: 24,
  },
  summaryItem: {
    alignItems: 'flex-start',
  },
  summaryCount: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  summaryLabel: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  sectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E8E8E8',
    marginBottom: 12,
    overflow: 'hidden',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 8,
  },
  sectionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  sectionHelper: {
    fontSize: 12,
    color: '#888',
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: '#FFFFFF',
    marginTop: -4,
  },
  sectionContent: {
    padding: 0,
  },
  permissionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderTopColor: '#E8E8E8',
    backgroundColor: '#FFFFFF',
  },
  permissionItemHighlight: {
    backgroundColor: '#F7F7F7',
    borderLeftWidth: 4,
    borderLeftColor: Colors.verusGreenColor,
  },
  permissionLeft: {
    flex: 1,
    marginRight: 12,
  },
  permissionTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1A1A1A',
    marginBottom: 2,
  },
  permissionSubtitle: {
    fontSize: 12,
    color: '#888',
    lineHeight: 16,
  },
  permissionStatusIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  permissionStatusIncluded: {
    backgroundColor: '#ECFDF3',
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  permissionStatusElevated: {
    shadowColor: '#ccc',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  permissionStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
    marginBottom: 4,
    paddingHorizontal: 4,
  },
  permissionStatusMessage: {
    fontSize: 12,
    color: '#666',
    flex: 1,
  },
  footer: {
    backgroundColor: 'white',
    width: '100%',
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: '#E8E8E8',
  },
  ctaCol: {
    flex: 1,
    minWidth: 0,
  },
  secondaryCta: {
    width: '100%',
    height: 44,
    borderRadius: 22,
    backgroundColor: '#EBF6FF',
    borderWidth: 0,
    elevation: 0,
    shadowColor: 'transparent',
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
  },
  secondaryCtaContent: {
    height: 44,
  },
  secondaryCtaLabel: {
    color: Colors.primaryColor,
    fontWeight: '700',
    fontSize: 16,
    letterSpacing: 0,
    textTransform: 'none',
  },
  primaryCta: {
    width: '100%',
    alignSelf: 'stretch',
    height: 44,
    borderRadius: 22,
  },
  // Simple mode styles
  simpleContent: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  simpleHeader: {
    alignItems: 'center',
    marginBottom: 32,
  },
  simpleIconContainer: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#EBF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  simpleTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 8,
    textAlign: 'center',
  },
  simpleSubtitle: {
    fontSize: 15,
    color: '#666',
    textAlign: 'center',
    lineHeight: 22,
  },
  simpleRequesterCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E8E8E8',
  },
  simpleRequesterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  simpleRequesterName: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: '#1A1A1A',
    marginLeft: 10,
  },
  simpleChipRow: {
    flexDirection: 'row',
    gap: 8,
  },
  simpleChip: {
    backgroundColor: '#F5F5F5',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  simpleChipText: {
    fontSize: 11,
    color: '#666',
    fontWeight: '600',
  },
  simpleInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 8,
  },
  simpleInfoText: {
    fontSize: 13,
    color: '#6B7280',
  },
});

export default LoginRequestInfo;
