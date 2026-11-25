/*
  IdentityHome
  - 2026-01-23: Updated to use navigation to VerusIdDetails screen instead of bottom sheet modal.
    Removed modal-related state and replaced openVerusIdDetailsModal with navigateToVerusIdDetails.
  - 2026-01-23: Fixed categorization logic to ensure already-linked IDs don't appear in pending sections.
    Enhanced filtering with case-insensitive comparison across all chains for both iAddr and display name.
*/
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useDispatch } from 'react-redux';
import { useNavigation } from '@react-navigation/native';
import { primitives } from 'verusid-ts-client';
import { Buffer } from 'buffer';
import { useObjectSelector } from '../../../hooks/useObjectSelector';
import { VERUSID_NETWORK_DEFAULT } from '../../../../env/index';
import { VERUSID_SERVICE_ID } from '../../../utils/constants/services';
import {
  NOTIFICATION_TYPE_VERUSID_READY,
  NOTIFICATION_TYPE_VERUSID_ERROR,
} from '../../../utils/constants/services';
import { setServiceLoading } from '../../../actions/actionCreators';
import { requestServiceStoredData } from '../../../utils/auth/authBox';
import { createAlert } from '../../../actions/actions/alert/dispatchers/alert';
import { openLinkIdentityModal } from '../../../actions/actions/sendModal/dispatchers/sendModal';
import { dispatchRemoveNotification } from '../../../actions/actions/notifications/dispatchers/notifications';
import { CoinDirectory } from '../../../utils/CoinData/CoinDirectory';
import IdentityHomeRender from './IdentityHome.render';
import { convertFqnToDisplayFormat } from '../../../utils/fullyqualifiedname';
import { SEND_MODAL_IDENTITY_TO_LINK_FIELD } from '../../../utils/constants/sendModal';
import { processVerusId } from '../../Services/ServiceComponents/VerusIdService/VerusIdLogin';
import {
  checkVerusIdNotificationsForUpdates,
  deleteProvisionedIds,
} from '../../../actions/actions/services/dispatchers/verusid/verusid';
import { updatePendingVerusIds } from '../../../actions/actions/channels/verusid/dispatchers/VerusidWalletReduxManager';

function countLinkedIds(linkedIds) {
  if (!linkedIds || typeof linkedIds !== 'object') return 0;
  let count = 0;
  for (const chainId of Object.keys(linkedIds)) {
    const chainMap = linkedIds[chainId];
    if (chainMap && typeof chainMap === 'object') {
      count += Object.keys(chainMap).length;
    }
  }
  return count;
}

function getReadyActionConfig(details) {
  const requestType = details?.requestType || 'loginconsent';
  let hasResponseUris = Boolean(details?.hasResponseUris);

  if (!hasResponseUris && requestType === 'loginconsent' && details?.loginRequest) {
    try {
      const req = new primitives.LoginConsentRequest();
      req.fromBuffer(Buffer.from(details.loginRequest, 'base64'));
      hasResponseUris = Array.isArray(req.challenge?.redirect_uris) && req.challenge.redirect_uris.length > 0;
    } catch (e) {
      hasResponseUris = false;
    }
  }

  return {
    requestType,
    hasResponseUris,
    ctaLabel: hasResponseUris ? 'Link and login' : 'Link',
  };
}

const IdentityHome = () => {
  const dispatch = useDispatch();
  const navigation = useNavigation();
  
  // Dimensions
  const layoutWidth = useObjectSelector(state => state.windowDimensions?.width) || 0;
  const [measuredWidth, setMeasuredWidth] = useState(0);
  const width = measuredWidth || layoutWidth || 390;

  // Redux state
  const testnetOverrides = useObjectSelector(
    state => state.authentication.activeAccount?.testnetOverrides || {},
  );
  const encryptedIds = useObjectSelector(state => state.services.stored[VERUSID_SERVICE_ID]);
  const pendingIds = useObjectSelector(state => state.channelStore_verusid?.pendingIds || {});

  // Local state
  const [infoSheetVisible, setInfoSheetVisible] = useState(false);
  const [pendingStatusSheetVisible, setPendingStatusSheetVisible] = useState(false);
  const [selectedPendingItem, setSelectedPendingItem] = useState(null);
  const [pendingAction, setPendingAction] = useState(null);
  const [loading, setLoading] = useState(false);
  const [linkedIds, setLinkedIds] = useState(null);

  const identityNetwork = useMemo(() => {
    return testnetOverrides[VERUSID_NETWORK_DEFAULT]
      ? testnetOverrides[VERUSID_NETWORK_DEFAULT]
      : VERUSID_NETWORK_DEFAULT;
  }, [testnetOverrides]);

  const fetchLinkedIds = useCallback(async () => {
    setLoading(true);
    dispatch(setServiceLoading(true, VERUSID_SERVICE_ID));

    try {
      const serviceData = await requestServiceStoredData(VERUSID_SERVICE_ID);
      setLinkedIds(serviceData?.linked_ids ? serviceData.linked_ids : {});
    } catch (e) {
      createAlert('Error Loading Linked VerusIDs', e.message);
      setLinkedIds({});
    } finally {
      dispatch(setServiceLoading(false, VERUSID_SERVICE_ID));
      setLoading(false);
    }
  }, [dispatch]);

  useEffect(() => {
    fetchLinkedIds();
  }, []);

  useEffect(() => {
    fetchLinkedIds();
  }, [encryptedIds]);

  const openLink = useCallback(() => {
    openLinkIdentityModal(CoinDirectory.findCoinObj(identityNetwork));
  }, [identityNetwork]);

  const openLinkPrefilled = useCallback((chain, identityInput) => {
    const coinObj = CoinDirectory.findCoinObj(chain);
    openLinkIdentityModal(coinObj, { [SEND_MODAL_IDENTITY_TO_LINK_FIELD]: identityInput });
  }, []);

  const openPendingStatusSheet = useCallback((item) => {
    setSelectedPendingItem(item);
    setPendingStatusSheetVisible(true);
  }, []);

  const closePendingStatusSheet = useCallback(() => {
    if (pendingAction) return;
    setPendingStatusSheetVisible(false);
    setSelectedPendingItem(null);
  }, [pendingAction]);

  const refreshPendingIdentity = useCallback(async () => {
    if (!selectedPendingItem || pendingAction) return;

    setPendingAction('refresh');
    try {
      await checkVerusIdNotificationsForUpdates();
      await updatePendingVerusIds();
      setPendingStatusSheetVisible(false);
      setSelectedPendingItem(null);
    } catch (e) {
      createAlert('Unable to refresh status', e.message);
    } finally {
      setPendingAction(null);
    }
  }, [selectedPendingItem, pendingAction]);

  const removePendingIdentity = useCallback(async () => {
    if (!selectedPendingItem || pendingAction) return;

    setPendingAction('remove');
    try {
      await deleteProvisionedIds(selectedPendingItem.iAddr, selectedPendingItem.chainId);
      await updatePendingVerusIds();
      if (selectedPendingItem.details?.notificationUid) {
        dispatchRemoveNotification(selectedPendingItem.details.notificationUid);
      }
      setPendingStatusSheetVisible(false);
      setSelectedPendingItem(null);
    } catch (e) {
      createAlert('Unable to remove identity', e.message);
    } finally {
      setPendingAction(null);
    }
  }, [selectedPendingItem, pendingAction]);

  const retryPendingIdentity = useCallback(async () => {
    if (!selectedPendingItem || pendingAction) return;

    if (!selectedPendingItem.details?.loginRequest) {
      createAlert('Retry unavailable', 'The original provisioning payload is missing for this item.');
      return;
    }

    setPendingAction('retry');
    try {
      setPendingStatusSheetVisible(false);
      await processVerusId(
        { dispatch, navigation },
        selectedPendingItem.details.loginRequest,
        selectedPendingItem.details.fromService || null,
        selectedPendingItem.details.fqn || null,
        selectedPendingItem.details.requestType || 'loginconsent',
      );
      setSelectedPendingItem(null);
    } catch (e) {
      createAlert('Unable to retry request', e.message);
    } finally {
      setPendingAction(null);
    }
  }, [selectedPendingItem, pendingAction, dispatch, navigation]);

  const handleReadyIdentityAction = useCallback((item) => {
    const config = item?.readyActionConfig;
    if (!config?.hasResponseUris) {
      openLinkPrefilled(item.chainId, item.linkInput);
      return;
    }

    if (!item?.details?.loginRequest) {
      openLinkPrefilled(item.chainId, item.linkInput);
      return;
    }

    Promise.resolve(
      processVerusId(
        { dispatch, navigation },
        item.details.loginRequest,
        item.details.fromService || null,
        item.details.fqn || null,
        config.requestType,
      ),
    ).catch(() => {
      openLinkPrefilled(item.chainId, item.linkInput);
    });
  }, [dispatch, navigation, openLinkPrefilled]);

  // Navigate to VerusIdDetails screen instead of opening a modal
  const navigateToVerusIdDetails = useCallback(
    (chain, iAddress, displayName) => {
      navigation.navigate('VerusIdDetails', {
        chain,
        iAddress,
        displayName,
      });
    },
    [navigation],
  );

  const openRegistrations = useCallback(() => {
    navigation.navigate('IdentityRegistration', { screen: 'IdentityRegistrationStart' });
  }, [navigation]);

  const onLayout = (e) => {
    const w = e?.nativeEvent?.layout?.width;
    if (typeof w === 'number' && w > 0 && w !== measuredWidth) {
      setMeasuredWidth(w);
    }
  };

  const linkedIdCount = useMemo(() => countLinkedIds(linkedIds), [linkedIds]);

  const { linkedItems, pendingGroups } = useMemo(() => {
    const linked = [];
    if (linkedIds && typeof linkedIds === 'object') {
      for (const chainId of Object.keys(linkedIds)) {
        const chainMap = linkedIds[chainId] || {};
        for (const iAddr of Object.keys(chainMap)) {
          linked.push({
            chainId,
            iAddr,
            display: chainMap[iAddr],
          });
        }
      }
    }

    linked.sort((a, b) => {
      const aPreferred = a.chainId === identityNetwork ? 0 : 1;
      const bPreferred = b.chainId === identityNetwork ? 0 : 1;
      if (aPreferred !== bPreferred) return aPreferred - bPreferred;
      const chainCmp = String(a.chainId).localeCompare(String(b.chainId));
      if (chainCmp !== 0) return chainCmp;
      return String(a.display).localeCompare(String(b.display), undefined, { sensitivity: 'base' });
    });

    const groups = {
      ready: [],
      attention: [],
      progress: [],
    };

    // pendingIds are stored as { [chainTicker]: { [iAddress]: details } }
    if (pendingIds && typeof pendingIds === 'object') {
      for (const chainId of Object.keys(pendingIds)) {
        const chainMap = pendingIds[chainId] || {};
        for (const iAddr of Object.keys(chainMap)) {
          const details = chainMap[iAddr] || {};
          const fqn = details.fqn || '';
          const display = fqn ? convertFqnToDisplayFormat(fqn) : (details.provisioningName ? `${details.provisioningName}@` : iAddr);

          // Skip if already linked - check across all chains with case-insensitive comparison
          let isAlreadyLinked = false;
          
          if (linkedIds && typeof linkedIds === 'object') {
            for (const linkedChainId of Object.keys(linkedIds)) {
              const linkedChainMap = linkedIds[linkedChainId] || {};
              
              // Check if iAddr matches (case-insensitive)
              if (Object.keys(linkedChainMap).some(
                linkedAddr => linkedAddr.toLowerCase() === iAddr.toLowerCase()
              )) {
                isAlreadyLinked = true;
                break;
              }
              
              // Check if display name matches (case-insensitive)
              if (Object.values(linkedChainMap).some(
                linkedDisplay => String(linkedDisplay).toLowerCase() === String(display).toLowerCase()
              )) {
                isAlreadyLinked = true;
                break;
              }
            }
          }
          
          if (isAlreadyLinked) continue;

          const linkInput = fqn ? convertFqnToDisplayFormat(fqn) : iAddr;
          const status = details.status;

          const item = {
            chainId,
            iAddr,
            status,
            display,
            linkInput,
            details,
            readyActionConfig: getReadyActionConfig(details),
          };

          if (status === NOTIFICATION_TYPE_VERUSID_READY) groups.ready.push(item);
          else if (status === NOTIFICATION_TYPE_VERUSID_ERROR) groups.attention.push(item);
          else groups.progress.push(item);
        }
      }
    }

    const byName = (x, y) =>
      String(x.display).localeCompare(String(y.display), undefined, { sensitivity: 'base' });
    groups.ready.sort(byName);
    groups.attention.sort(byName);
    groups.progress.sort(byName);

    return { linkedItems: linked, pendingGroups: groups };
  }, [linkedIds, pendingIds, identityNetwork]);

  const hasPending =
    (pendingGroups.ready?.length ?? 0) +
      (pendingGroups.attention?.length ?? 0) +
      (pendingGroups.progress?.length ?? 0) >
    0;

  return (
    <IdentityHomeRender
      width={width}
      linkedIds={linkedIds}
      loading={loading}
      linkedIdCount={linkedIdCount}
      hasLinkedIds={linkedIdCount > 0}
      infoSheetVisible={infoSheetVisible}
      setInfoSheetVisible={setInfoSheetVisible}
      pendingStatusSheetVisible={pendingStatusSheetVisible}
      selectedPendingItem={selectedPendingItem}
      pendingAction={pendingAction}
      openPendingStatusSheet={openPendingStatusSheet}
      closePendingStatusSheet={closePendingStatusSheet}
      refreshPendingIdentity={refreshPendingIdentity}
      removePendingIdentity={removePendingIdentity}
      retryPendingIdentity={retryPendingIdentity}
      openLink={openLink}
      linkedItems={linkedItems}
      pendingGroups={pendingGroups}
      hasPending={hasPending}
      handleReadyIdentityAction={handleReadyIdentityAction}
      navigateToVerusIdDetails={navigateToVerusIdDetails}
      openRegistrations={openRegistrations}
      identityNetwork={identityNetwork}
      onLayout={onLayout}
    />
  );
};

export default IdentityHome;
