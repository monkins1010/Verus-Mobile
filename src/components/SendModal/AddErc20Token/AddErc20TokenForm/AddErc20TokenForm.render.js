import React from "react";
import { ScrollView, View, TouchableWithoutFeedback, Keyboard } from "react-native";
import { TextInput, Checkbox } from "react-native-paper";
import Button from "../../../Button";
import Styles from "../../../../styles";
import { SEND_MODAL_CONTRACT_ADDRESS_FIELD } from "../../../../utils/constants/sendModal";
import Colors from "../../../../globals/colors";

export const AddErc20TokenFormRender = ({
  submitData, 
  updateSendFormData, 
  formDataValue, 
  useMappedCurrency,
  setUseMappedCurrency,
  supportsVrscBridge,
  networkName
}) => {
  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      <ScrollView
        style={{
          ...Styles.flexBackground,
          ...Styles.fullWidth,
        }}
        contentContainerStyle={{
          ...Styles.centerContainer,
          justifyContent: "flex-start",
        }}
      >
        <View style={Styles.wideBlock}>
          <TextInput
            returnKeyType="done"
            label={useMappedCurrency ? "Mapped PBaaS currency" : `Contract address on ${networkName}`}
            value={formDataValue}
            mode="outlined"
            onChangeText={(text) =>
              updateSendFormData(SEND_MODAL_CONTRACT_ADDRESS_FIELD, text)
            }
            autoCapitalize={"none"}
            autoCorrect={false}
          />
        </View>
        {supportsVrscBridge && (
          <View style={{...Styles.wideBlockDense, paddingTop: 0}}>
            <Checkbox.Item
              color={Colors.primaryColor}
              label={'Find using mapped PBaaS currency'}
              status={
                useMappedCurrency ? 'checked' : 'unchecked'
              }
              onPress={() => setUseMappedCurrency(!useMappedCurrency)}
              mode="android"
            />
          </View>
        )}
        <View style={Styles.wideBlockDense}>
          <Button mode="contained" onPress={submitData}>
            Continue
          </Button>
        </View>
      </ScrollView>
    </TouchableWithoutFeedback>
  );
};