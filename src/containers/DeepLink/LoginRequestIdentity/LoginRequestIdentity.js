/*
  LoginRequestIdentity
  - 2026-01-23: Fixed bug where 'Request VerusID' modal would reopen after successful provisioning.
    Added checks for idProvisionSuccess and sendModal.data?.success to prevent auto-opening
    the modal when provisioning has completed successfully.
  - 2026-01-16: Fixed modal stack overlap issue where auto-opening the provisioning modal
    would occur while the auth modal was still closing, leaving only a dark overlay visible
    and blocking all user interaction. Now delays auto-open by 100ms and checks sendModal.visible
    to ensure the previous modal is fully closed before opening the next one.
*/
import React, { useState, useEffect } from 'react';
import { ScrollView } from 'react-native';
import Styles from '../../../styles/index';
import { primitives } from "verusid-ts-client"
import { createAlert } from '../../../actions/actions/alert/dispatchers/alert';
import { useSelector, useDispatch } from 'react-redux';
import { openLinkIdentityModal, openProvisionIdentityModal } from '../../../actions/actions/sendModal/dispatchers/sendModal';
import AnimatedActivityIndicatorBox from '../../../components/AnimatedActivityIndicatorBox';
import { requestServiceStoredData } from '../../../utils/auth/authBox';
import { VERUSID_SERVICE_ID } from '../../../utils/constants/services';
import { Divider, List } from 'react-native-paper';
import { signLoginConsentResponse } from '../../../utils/api/channels/vrpc/requests/signLoginConsentResponse';
import BigNumber from 'bignumber.js';
import { VERUSID_NETWORK_DEFAULT } from "../../../../env/index";
import { CoinDirectory } from '../../../utils/CoinData/CoinDirectory';
import { CommonActions } from '@react-navigation/native';
import { SEND_MODAL_IDENTITY_TO_LINK_FIELD } from '../../../utils/constants/sendModal';
import { ELECTRUM } from '../../../utils/constants/intervalConstants';
import { coinsList } from '../../../utils/CoinData/CoinsList';
import { requestSeeds } from '../../../utils/auth/authBox';
import crypto from 'crypto'
import { useObjectSelector } from '../../../hooks/useObjectSelector';
import { convertFqnToDisplayFormat } from '../../../utils/fullyqualifiedname';
import { signHash } from '../../../utils/api/channels/vrpc/requests/signHash';
import { Buffer } from 'buffer';
import { BN } from 'bn.js';
import { getInfo } from "../../../utils/api/channels/vrpc/callCreators";
import { PERMISSION_STATUS } from '../../../utils/constants/loginPermissions';
const { getSignatureInfo } = require("../../../utils/api/channels/vrpc/requests/getSignatureInfo");
const LoginRequestIdentity = props => {
  const deeplinkData = useSelector(state => state.deeplink.data)
  const [loading, setLoading] = useState(false)
  const [linkedIds, setLinkedIds] = useState({})
  const [sortedIds, setSortedIds] = useState({});
  const [idProvisionSuccess, setIdProvisionSuccess] = useState(false)
  const [canProvision, setCanProvision] = useState(false)
  const req = new primitives.LoginConsentRequest(deeplinkData)
  const encryptedIds = useObjectSelector(state => state.services.stored[VERUSID_SERVICE_ID])
  const sendModal = useObjectSelector((state) => state.sendModal);

  const fromService = useSelector((state) => state.deeplink.fromService);
  const passthrough = useSelector((state) => state.deeplink.passthrough);

  useEffect(() => {
    let canProvision = req.challenge.provisioning_info && req.challenge.provisioning_info.some(x => {
      return (
        x.vdxfkey ===
        primitives.LOGIN_CONSENT_ID_PROVISIONING_WEBHOOK_VDXF_KEY
          .vdxfid
      );
    })

    if (Object.keys(linkedIds).length > 0) {
      for (const chainId of Object.keys(linkedIds)) {
        if (linkedIds[chainId] &&
          Object.keys(linkedIds[chainId])
            .includes(req.challenge.subject?.find(item => item.vdxfkey === primitives.ID_ADDRESS_VDXF_KEY.vdxfid)?.data)) {
          canProvision = false;
        }
      }
    }

    setCanProvision(canProvision)

    // Automatically open provision identity modal if canProvision is true and we're not autolinking
    // BUT ONLY if no SendModal is currently visible (avoid modal stack overlap)
    // AND provisioning hasn't already completed successfully (prevent reopening after success)
    if (canProvision && 
        !passthrough?.fqnToAutoLink && 
        !sendModal.visible && 
        !idProvisionSuccess && 
        !sendModal.data?.success) {
      // Delay to ensure any closing modal finishes first (avoid modal stack race)
      const timer = setTimeout(() => {
        openProvisionIdentityModalFromChain();
      }, 100); // Small delay ensures clean modal stack
      
      return () => clearTimeout(timer);
    }
  }, [linkedIds, sendModal.visible, idProvisionSuccess])

  const activeCoinsForUser = useObjectSelector(state => state.coins.activeCoinsForUser)
  const testnetOverrides = useObjectSelector(state => state.authentication.activeAccount.testnetOverrides)
  const identityNetwork = testnetOverrides[VERUSID_NETWORK_DEFAULT]
    ? testnetOverrides[VERUSID_NETWORK_DEFAULT]
    : VERUSID_NETWORK_DEFAULT;

  const activeCoinIds = activeCoinsForUser.map(coinObj => coinObj.id)

  const { system_id } = req;

  async function onEncryptedIdsUpdate() {
    setLoading(true)

    try {
      const verusIdServiceData = await requestServiceStoredData(
        VERUSID_SERVICE_ID,
      );

      if (verusIdServiceData.linked_ids) {
        setLinkedIds(verusIdServiceData.linked_ids)
      } else {
        setLinkedIds({})
      }

    } catch (e) {
      createAlert('Error Loading Linked VerusIDs', e.message);
    }

    setLoading(false)
  }

  useEffect(() => {
    if (passthrough && passthrough.fqnToAutoLink) {

      let noLogin = false;

      if (!req.challenge.redirect_uris || req.challenge.redirect_uris.length == 0) {
        noLogin = true;
      }

      const data = { [SEND_MODAL_IDENTITY_TO_LINK_FIELD]: passthrough.fqnToAutoLink, noLogin: noLogin };
      openLinkIdentityModal(CoinDirectory.findCoinObj(system_id, null, true), data);
    }
  }, [passthrough])

  //TODO: add a check that checks to see if the ID is ready, and relates to the provider.

  useEffect(() => {
    onEncryptedIdsUpdate()
  }, [encryptedIds])

  useEffect(() => {
    if (!idProvisionSuccess && sendModal.data?.success) {
      setIdProvisionSuccess(true);
      return;
    }

    if (idProvisionSuccess && !sendModal.visible) {
      props.navigation.dispatch(
        CommonActions.reset({
          index: 0,
          routes: [
            {
              name: 'SignedInStack',
              params: {
                screen: 'Home',
                params: {
                  screen: 'IdentityTab',
                },
              },
            },
          ],
        }),
      );
    }
  }, [idProvisionSuccess, sendModal.data?.success, sendModal.visible, props.navigation])

  useEffect(() => {
    const sortedIdKeysPerChain = {}

    for (const chainId of activeCoinIds) {
      sortedIdKeysPerChain[chainId] = linkedIds[chainId]
        ? Object.keys(linkedIds[chainId]).sort(function (x, y) {
          if (linkedIds[chainId][x] < linkedIds[chainId][y]) {
            return -1;
          }
          if (linkedIds[chainId][x] > linkedIds[chainId][y]) {
            return 1;
          }
          return 0;
        })
        : [];
    }

    setSortedIds(sortedIdKeysPerChain)
  }, [linkedIds])

  const openLinkIdentityModalFromChain = () => {
    return openLinkIdentityModal(CoinDirectory.findCoinObj(system_id, null, true));
  }

  const openProvisionIdentityModalFromChain = () => {
    openProvisionIdentityModal(CoinDirectory.findCoinObj(system_id, null, true), req, fromService)
  }

  const selectIdentity = async (iAddress) => {
    try {
      const signedResponse = await signLoginConsentResponse(
        CoinDirectory.findCoinObj(system_id, null, true),
        {
          system_id: system_id,
          signing_id: iAddress,
          decision: new primitives.LoginConsentDecision({
            decision_id: req.challenge.challenge_id,
            request: req,
            created_at: BigNumber(Date.now())
              .dividedBy(1000)
              .decimalPlaces(0)
              .toNumber(),
          }),
        },
      );

      let foundMessage = req.challenge.requested_access.filter(x => x.vdxfkey === primitives.IDENTITY_SIGNDATA_REQUEST.vdxfid) || [];
      let signedMessage = {};
      
      if (foundMessage.length > 0) {
        // Get all signature subject items that were agreed to
        const allSignatureSubjects = req.challenge.subject?.filter(item =>
          item.vdxfkey === primitives.IDENTITY_SIGNDATA_REQUEST.vdxfid
        ) || [];

        if (allSignatureSubjects.length === 0) {
          throw new Error("No endorsement data found to sign");
        }

        // Check which signature requests were agreed to via passthrough permissions
        const agreedSignatures = [];
        for (let i = 0; i < allSignatureSubjects.length; i++) {
          const permission = passthrough?.permissions?.[i];
          if (permission?.status === PERMISSION_STATUS.AGREED && permission?.permissionType === 'signmessage') {
            agreedSignatures.push({ subjectItem: allSignatureSubjects[i], index: i });
          }
        }

        if (agreedSignatures.length === 0) {
          throw new Error("No signature requests were agreed to");
        }

        // Process all agreed signatures
        const signedEndorsements = [];
        const chainInfo = await getInfo(system_id);
        const height = chainInfo.result.longestchain;

        for (const { subjectItem, index } of agreedSignatures) {
          // Create endorsement object from the base64 data
          const endorsement = new primitives.Endorsement();
          endorsement.fromBuffer(Buffer.from(subjectItem.data, 'base64'));

          const signatureData = new primitives.SignatureData({ version: new BN(1) });

          signatureData.IdentityID = iAddress;
          signatureData.SystemID = system_id;
          signatureData.signmatureHash = crypto.createHash('sha256').update(subjectItem.data).digest()

          const idClass = new primitives.SignatureData();

          idClass.SystemID = system_id;
          idClass.IdentityID = iAddress;
          idClass.signmatureHash = signatureData.signmatureHash;

          const sigHash = idClass.getIdentityHash({ version: 2, hash_type: 5, height });
          const signature = await signHash(CoinDirectory.findCoinObj(system_id, null, true), iAddress, sigHash, height);

          signatureData.signatureAsVch = Buffer.from(signature, 'base64');
          endorsement.signature = signatureData;
          endorsement.flags = primitives.Endorsement.FLAGS_HAS_SIGNATURE;
          
          signedEndorsements.push(endorsement.toJson());
        }

        // If there's only one signature, maintain backward compatibility
        if (signedEndorsements.length === 1) {
          signedMessage.endorsement = signedEndorsements[0];
        } else {
          // For multiple signatures, send as an array
          signedMessage.endorsements = signedEndorsements;
        }
      }
      props.navigation.navigate("LoginRequestComplete", {
        signedResponse,
        signedMessage,
      })
    } catch (e) {
      createAlert("Error", e.message)
    }
  };

  return loading ? (
    <AnimatedActivityIndicatorBox />
  ) : (
    <ScrollView style={{ ...Styles.fullWidth, ...Styles.backgroundColorWhite }}>
      {Object.keys(sortedIds).filter(x => x === identityNetwork).map(chainId => {
        return (
          <React.Fragment key={chainId}>
            {sortedIds[chainId].length > 0 && (
              <List.Subheader>{`Linked ${chainId} VerusIDs`}</List.Subheader>
            )}
            {sortedIds[chainId].map(iAddr => {
              return (
                <React.Fragment key={iAddr}>
                  <Divider />
                  <List.Item
                    title={linkedIds[chainId][iAddr] && linkedIds[chainId][iAddr] !== iAddr
                      ? convertFqnToDisplayFormat(linkedIds[chainId][iAddr]) : iAddr}
                    description={iAddr}
                    descriptionNumberOfLines={1}
                    titleNumberOfLines={1}
                    left={props => <List.Icon {...props} icon={'account'} />}
                    right={props => (
                      <List.Icon {...props} icon={'chevron-right'} size={20} />
                    )}
                    onPress={() => selectIdentity(iAddr)}
                  />
                </React.Fragment>
              );
            })}
            <Divider />
            <List.Subheader>{`Options`}</List.Subheader>
            <Divider />
            <List.Item
              title={'Link VerusID'}
              right={props => <List.Icon {...props} icon={'plus'} size={20} />}
              onPress={() => openLinkIdentityModalFromChain(chainId)}
            />
            <Divider />
            {canProvision && (
              <React.Fragment>
                <List.Item
                  title={'Request VerusID'}
                  right={props => (
                    <List.Icon {...props} icon={'plus'} size={20} />
                  )}
                  onPress={() => openProvisionIdentityModalFromChain(chainId)}
                />
                <Divider />
              </React.Fragment>
            )}
          </React.Fragment>
        );
      })}
    </ScrollView>
  );
};

export default LoginRequestIdentity;
