/*
  LinkIdentityForm.render
  - 2026-01-13: Show the Link VerusID help copy inline (instead of via a header Help button),
    so the flow is readable without extra taps.
  - 2026-01-13: Update the Link VerusID input to reuse the Unlock screen's "soft background"
    input styling pattern (container w/ focus border + subtle shadow), without password-specific
    affordances (no secure entry / no eye toggle).
  - 2026-01-13: Removed the redundant label above the field and standardized copy to "i-address".
*/
import React from "react";
import { ScrollView, View, TouchableWithoutFeedback, Keyboard } from "react-native";
import { TextInput } from "react-native-paper";
import Button from "../../../Button";
import Styles from "../../../../styles";
import Colors from "../../../../globals/colors";
import GradientButton from "../../../GradientButton";
import { SEND_MODAL_IDENTITY_TO_LINK_FIELD } from "../../../../utils/constants/sendModal";

export const LinkIdentityFormRender = ({
  submitData,
  updateSendFormData,
  formDataValue,
  helpText,
  isFocused,
  onFocus,
  onBlur,
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
        {!!helpText && (
          <View style={{ ...Styles.wideBlock, paddingBottom: 0 }}>
            <Text style={{ color: "#666", lineHeight: 18 }}>
              {helpText}
            </Text>
          </View>
        )}
        <View style={Styles.wideBlock}>
          <View
            style={[
              styles.inputContainer,
              isFocused && styles.inputContainerFocused,
            ]}
          >
            <RNTextInput
              value={formDataValue ?? ""}
              onChangeText={(text) =>
                updateSendFormData(SEND_MODAL_IDENTITY_TO_LINK_FIELD, text)
              }
              onFocus={onFocus}
              onBlur={onBlur}
              placeholder="i-address or VerusID handle"
              placeholderTextColor="#999"
              returnKeyType="done"
              autoCorrect={false}
              autoCapitalize="none"
              spellCheck={false}
              onSubmitEditing={submitData}
              style={styles.input}
            />
          </View>
        </View>
        <View style={{ ...Styles.wideBlock, paddingTop: 0 }}>
          <GradientButton onPress={submitData} style={{ width: '100%' }}>
            {"Link"}
          </GradientButton>
        </View>
      </ScrollView>
    </TouchableWithoutFeedback>
  );
};

const styles = StyleSheet.create({
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F7F7F7",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "transparent",
    marginBottom: 16,
    height: 52,
  },
  inputContainerFocused: {
    backgroundColor: "#FFF",
    borderColor: Colors.primaryColor,
    shadowColor: Colors.primaryColor,
    shadowOpacity: 0.1,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  input: {
    flex: 1,
    height: 52,
    paddingHorizontal: 16,
    fontSize: 16,
    color: "#1A1A1A",
  },
});