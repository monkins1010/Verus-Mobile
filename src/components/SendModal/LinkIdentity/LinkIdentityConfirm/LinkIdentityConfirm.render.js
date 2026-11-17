/*
  LinkIdentityConfirm.render
  - 2026-01-13: Restyle the Confirm-step CTAs for Link VerusID to match the Identity screen’s
    on-brand button patterns: GradientButton primary ("Link VerusID") + light-blue pill
    secondary ("Back"), replacing the prior green/red semantics.
*/
import React from 'react';
import { ScrollView, View, SafeAreaView, StyleSheet } from 'react-native';
import Button from '../../../Button';
import Colors from '../../../../globals/colors';
import Styles from '../../../../styles';
import GradientButton from '../../../GradientButton';
import VerusIdObjectData from '../../../VerusIdObjectData';

export const LinkIdentityConfirmRender = ({ verusId, friendlyNames, goBack, submitData, ownedByUser, ownedAddress }) => {
  return (
    <SafeAreaView style={{ ...Styles.fullWidth, ...Styles.backgroundColorWhite }}>
      <VerusIdObjectData
        verusId={verusId}
        friendlyNames={friendlyNames}
        ownedByUser={ownedByUser}
        ownedAddress={ownedAddress}
        StickyFooterComponent={
          <View style={styles.footer}>
            <View style={styles.ctaCol}>
              <Button
                mode="contained"
                onPress={goBack}
                style={styles.secondaryCta}
                contentStyle={styles.secondaryCtaContent}
                uppercase={false}
                buttonColor="#EBF6FF"
                textColor={Colors.primaryColor}
                labelStyle={styles.secondaryCtaLabel}
              >
                Back
              </Button>
            </View>
            <View style={styles.ctaCol}>
              <GradientButton onPress={submitData} style={styles.primaryCta}>
                Link VerusID
              </GradientButton>
            </View>
          </View>
        }
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  footer: {
    backgroundColor: 'white',
    width: '100%',
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 12,
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
    shadowOffset: {width: 0, height: 0},
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
});
