/*
  LinkIdentityResult.render
  - 2026-01-14: Keep the Result step, but restyle it to feel less "giant" and more on-brand:
    tighten spacing/typography and replace the off-brand green Done button with the standard
    GradientButton pill CTA (matching IdentityHome primary CTA styling).
*/
import React from 'react';
import {ScrollView, View, TouchableOpacity, StyleSheet} from 'react-native';
import {Text} from 'react-native-paper';
import Colors from '../../../../globals/colors';
import Styles from '../../../../styles';
import {copyToClipboard} from '../../../../utils/clipboard/clipboard';
import AnimatedSuccessCheckmark from '../../../AnimatedSuccessCheckmark';
import GradientButton from '../../../GradientButton';
import {convertFqnToDisplayFormat} from '../../../../utils/fullyqualifiedname';
import {useObjectSelector} from '../../../../hooks/useObjectSelector';

export const LinkIdentityResultRender = ({verusId, finishSend}) => {
  const coinObj = useObjectSelector(state => state.sendModal.coinObj);
  const formattedFriendlyName = convertFqnToDisplayFormat(verusId.fullyqualifiedname);

  return (
    <ScrollView
      style={{...Styles.fullWidth, ...Styles.backgroundColorWhite}}
      contentContainerStyle={{
        ...Styles.focalCenter,
        justifyContent: 'center',
        paddingVertical: 24,
      }}>
      <TouchableOpacity
        onPress={() =>
          copyToClipboard(verusId.identity.identityaddress, {
            title: 'Address copied',
            message: `${verusId.identity.identityaddress} copied to clipboard.`,
          })
        }
        style={styles.headingPressable}>
        <Text
          numberOfLines={3}
          style={styles.headingText}>
          {`${formattedFriendlyName} linked`}
        </Text>
      </TouchableOpacity>
      <View style={styles.checkmarkWrap}>
        <AnimatedSuccessCheckmark
          style={{
            width: 104,
          }}
        />
      </View>
      <View style={styles.bodyWrap}>
        <Text style={styles.bodyText}>
          {`All set. Your VerusID is now linked and ready to use.`}
        </Text>
      </View>
      <View style={styles.footer}>
        <GradientButton onPress={finishSend} style={styles.doneButton}>
          Done
        </GradientButton>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  headingPressable: {
    width: '82%',
    alignItems: 'center',
    marginBottom: 10,
  },
  headingText: {
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '700',
    color: Colors.quinaryColor,
    letterSpacing: -0.2,
  },
  checkmarkWrap: {
    paddingVertical: 10,
  },
  bodyWrap: {
    width: '82%',
    paddingTop: 6,
    paddingBottom: 16,
  },
  bodyText: {
    textAlign: 'center',
    fontSize: 15,
    color: Colors.verusDarkGray,
    lineHeight: 21,
  },
  footer: {
    width: '100%',
    paddingHorizontal: 20,
    paddingTop: 6,
  },
  doneButton: {
    width: '100%',
    height: 44,
    borderRadius: 22,
  },
});
