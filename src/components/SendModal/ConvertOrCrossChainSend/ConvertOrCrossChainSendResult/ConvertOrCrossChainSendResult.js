import React, { useEffect, useState } from "react";
import { closeSendModal } from "../../../../actions/actions/sendModal/dispatchers/sendModal";
import { openOffRamp } from "../../../../actions/actions/channels/valu/dispatchers/ValuWalletReduxManager";
import { explorers } from "../../../../utils/CoinData/CoinData";
import { openUrl } from "../../../../utils/linking";
import { ScrollView, View, TouchableOpacity } from "react-native";
import { Text } from "react-native-paper";
import Button from "../../../Button";
import Colors from "../../../../globals/colors";
import Styles from "../../../../styles";
import { copyToClipboard } from "../../../../utils/clipboard/clipboard";
import AnimatedSuccessCheckmark from "../../../AnimatedSuccessCheckmark";
import { SEND_MODAL_SEND_COMPLETED } from "../../../../utils/constants/sendModal";
import { useObjectSelector } from "../../../../hooks/useObjectSelector";
import { VerusPayInvoice } from "verus-typescript-primitives"
import { ValuOffRampCheck } from "../../../../containers/Services/ServiceComponents/ValuService/ValuOffRamp/ValuOffRampCheck";
import store from "../../../../store";
import { checkAndNotifyPopEligibility, createGetSponsoredAttestationNavigationCallback } from '../../../../utils/pop/popNotificationHelper';

const ConvertOrCrossChainSendResult = (props) => {
  const coinObj = useObjectSelector(state => state.sendModal.coinObj);
  const deeplinkData = useObjectSelector((state) => state.deeplink.data);
  const offRampRequest = useObjectSelector((state) => state.channelStore_valu_service.offRampRequest);
  const invoice = deeplinkData != null && Object.keys(deeplinkData).length > 0 ? VerusPayInvoice.fromJson(deeplinkData) : null;
  const [params, setParams] = useState(props.route.params == null ? {} : props.route.params);
  const { updateSendFormData } = props;

  const finishSend = async () => {
    closeSendModal();

    if (invoice != null && invoice.isSigned() && (invoice.signing_id === 'iBAkjbAzw9ruR4nRbud9UGzrPftmkpU4GQ' || invoice.signing_id === 'i8mq7inkLvNRwYQNTtt3uaaJCs5YkKxjGg') && offRampRequest != {}) {

      const proceedToValu = ValuOffRampCheck();

      if (proceedToValu) {
        openOffRamp();
      }
      
      // Check PoP eligibility after off-ramp payment completes
      try {
        const navigationCallback = createGetSponsoredAttestationNavigationCallback(props.navigation);
        const result = await checkAndNotifyPopEligibility(offRampRequest.requestId, navigationCallback);
        if (result.notificationCreated) {
          console.log('PoP notification created for user after off-ramp payment completion');
        }
      } catch (error) {
        console.error('Error checking PoP eligibility after off-ramp:', error);
      }
    }
  }

  const openExplorer = () => {
    const url = `${explorers[coinObj.id]}/tx/${params.txid}`;

    openUrl(url);
  };

  useEffect(() => {
    updateSendFormData(SEND_MODAL_SEND_COMPLETED, true)
  }, [])

  const { txid, output, destination } = params;
  const isBurnChangePrice = output?.burn === true;

  return (
    <ScrollView
      style={{ ...Styles.fullWidth, ...Styles.backgroundColorWhite }}
      contentContainerStyle={{
        ...Styles.focalCenter,
        justifyContent: 'space-between'
      }}
    >
      <TouchableOpacity
        style={{
          width: '75%',
          marginTop: 16,
        }}>
        <Text
          numberOfLines={1}
          style={{
            textAlign: 'center',
            fontSize: 20,
            color: Colors.verusDarkGray,
          }}>
          {isBurnChangePrice
            ? "Currency burn initiated"
            : output.convertto
              ? "Conversion initiated"
              : output.exportto
                ? "Off-chain send initiated"
                : "Send initiated"}
        </Text>
      </TouchableOpacity>
      <View style={{ paddingVertical: 16 }}>
        <AnimatedSuccessCheckmark
          style={{
            width: 128,
          }}
        />
      </View>
      <TouchableOpacity
        onPress={() =>
          copyToClipboard(destination, {
            title: isBurnChangePrice
              ? 'Burn output address copied'
              : 'Destination copied',
            message: `${destination} copied to clipboard.`,
          })
        }
        style={{
          width: '75%',
        }}>
        <Text
          numberOfLines={1}
          style={{
            textAlign: 'center',
            fontSize: 20,
            color: Colors.verusDarkGray,
          }}>
          {isBurnChangePrice ? 'burn output: ' : 'to '}
          <Text style={{ color: Colors.basicButtonColor, textAlign: 'center' }}>
            {destination}
          </Text>
        </Text>
      </TouchableOpacity>
      <View style={{ paddingVertical: 16, width: '75%' }}>
        <Text
          style={{
            textAlign: 'center',
            fontSize: 20,
            color: Colors.verusDarkGray,
          }}>
          {isBurnChangePrice
            ? 'The amount will be removed from circulation when the transaction is processed, reducing the currency\'s total supply. The burn output address identifies the transaction but does not receive the amount.'
            : 'Track its status under the Overview tab. It may take a time to arrive even after it is confirmed as sent.'}
        </Text>
      </View>
      <View
        style={{
          width: '90%',
          flexDirection: 'row',
          justifyContent: 'space-evenly',
        }}>
        {explorers[coinObj.id] != null && (
          <Button
            textColor={Colors.primaryColor}
            style={{ width: 148 }}
            labelStyle={{ fontSize: 18 }}
            onPress={() => openExplorer()}>
            Details
          </Button>
        )}
        <Button
          buttonColor={Colors.verusGreenColor}
          textColor={Colors.secondaryColor}
          style={{ width: 148 }}
          labelStyle={{ fontSize: 18 }}
          onPress={() => finishSend()}>
          Done
        </Button>
      </View>
      <TouchableOpacity
        onPress={() =>
          copyToClipboard(txid, {
            title: 'Transaction ID copied',
            message: `${txid} copied to clipboard.`,
          })
        }
        style={{
          width: '75%',
        }}>
        <Text
          numberOfLines={1}
          style={{
            textAlign: 'center',
            fontSize: 14,
            color: Colors.verusDarkGray,
          }}>
          {`id: ${txid}`}
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

export default ConvertOrCrossChainSendResult;
