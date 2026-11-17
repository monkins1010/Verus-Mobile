/*
  Updated WalletIntro screen:
  - Styling aligned with ChooseName/Landing/Login
  - Replaced icon with wallet hero image (png)
  - Updated CTA labels: "Create new wallet" and "I already have a wallet"
  - Both buttons have explicit shadow removal (elevation: 0, shadowColor: transparent) to prevent shadow artifacts on press
  - 2026-01-26: Updated primary button to use GradientButton and secondary button to match
    Unlock.js styling (light blue filled button).
*/
import React, { useState } from 'react';
import {View, Dimensions, TouchableOpacity, Image, SafeAreaView, StyleSheet} from 'react-native';
import {Text, IconButton, Button} from 'react-native-paper';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import { createAlert, resolveAlert } from '../../../actions/actions/alert/dispatchers/alert';
import GradientButton from '../../../components/GradientButton';
import Colors from '../../../globals/colors';
import WalletHero from '../../../images/customIcons/wallet-image.png';
import ImportWalletSheet from '../Forms/ImportWallet/Forms/ImportSheet';
import { getKey } from '../../../utils/keyGenerator/keyGenerator';
import { SMALL_DEVICE_HEGHT } from '../../../utils/constants/constants';

export default function WalletIntro({ navigation, setNewSeed, setTestProfile, testProfile }) {
  const {height} = Dimensions.get('window');
  const insets = useSafeAreaInsets();
  const isSmall = height <= SMALL_DEVICE_HEGHT;

  const [loading, setLoading] = useState(false)
  const [iconPressCount, setIconPressCount] = useState(0);
  const [importSheetVisible, setImportSheetVisible] = useState(false);

  const canEnableTestmode = () => {
    return createAlert(
      "Make this a test profile?",
      "Creating a test profile will set this profile to use testnet currencies.\n\nALL TESTNET COINS/CURRENCIES HAVE NO VALUE AND WILL DISAPPEAR WHENEVER THEIR NETWORK IS RESET.\n\nAre you sure you would like to create this profile as a test profile?",
      [
        {
          text: "No",
          onPress: () => resolveAlert(false),
          style: "cancel",
        },
        { text: "Yes", onPress: () => resolveAlert(true) },
      ],
      {
        cancelable: false,
      }
    )
  }

  const tryEnableTest = async () => {
    if (await canEnableTestmode()) {
      setTestProfile(true);
      createAlert(
        'Testnet profile set',
        'This profile will be created as a test profile, and will use testnet currencies.',
      );
    }
  }

  const disableTest = () => {
    setTestProfile(false);
    createAlert(
      'Mainnet profile set',
      'This profile will be created as a mainnet profile, and will use mainnet currencies.',
    );
  };

  const handleIconPress = () => {
    const newCount = iconPressCount + 1;
    setIconPressCount(newCount);

    if (newCount === 7 && !testProfile) {
      setIconPressCount(0);
      tryEnableTest()
    }
  };

  const createNewWallet = async function(cb = () => {}) {
    try {
      const newSeed = await getKey(256);

      setNewSeed(newSeed)
      navigation.navigate("CreateSeed")
      cb()
    } catch(e) {
      createAlert("Error", "Error generating seed words.")
      console.warn(e)
      cb()
    }
  }

  const createNewWalletSync = function() {
    setLoading(true)
    createNewWallet(() => setLoading(false))
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.secondaryColor }}>
      <View style={{ flex: 1, backgroundColor: Colors.secondaryColor, paddingHorizontal: 24, paddingTop: height < SMALL_DEVICE_HEGHT ? 40 : 60 }}>
        <TouchableOpacity
          onPress={testProfile ? disableTest : tryEnableTest}
          style={{ position: 'absolute', top: 12, right: 6 }}
        >
          <IconButton icon={testProfile ? "test-tube-off" : "test-tube"} iconColor={Colors.verusDarkGray} />
        </TouchableOpacity>

        {/* Hero image - larger and positioned closer to middle */}
        {height >= SMALL_DEVICE_HEGHT && (
          <View style={{ alignItems: 'center', marginTop: isSmall ? 24 : Math.min(80, Math.round(height * 0.12)), marginBottom: 32 }}>
            <Image
              source={WalletHero}
              style={{ width: isSmall ? 260 : 320, height: isSmall ? 190 : 230, resizeMode: 'contain' }}
            />
          </View>
        )}

        {/* Title & subtitle */}
        <Text style={{ textAlign: 'left', color: '#1A1A1A', fontSize: 32, fontWeight: '700', letterSpacing: -0.5, marginBottom: 12 }}>
          {testProfile ? 'Create your test wallet' : 'Create your wallet'}
        </Text>
        <Text style={{ textAlign: 'left', fontSize: 16, lineHeight: 22, color: '#555', marginBottom: 24 }}>
          {'Your wallet lives inside this profile. Create a new wallet or import one you already control.'}
        </Text>
        <View style={{ flex: 1 }} />
        <GradientButton
          onPress={() => createNewWalletSync()}
          disabled={loading}
          style={styles.primaryButton}
        >
          {'Create new wallet'}
        </GradientButton>
        <Button
          mode="contained"
          onPress={() => setImportSheetVisible(true)}
          disabled={loading}
          style={[styles.secondaryButton, { marginBottom: Math.max(24, insets.bottom + 16) }]}
          contentStyle={styles.secondaryButtonContent}
          labelStyle={styles.secondaryButtonLabel}
          buttonColor="#EBF6FF"
          textColor={Colors.primaryColor}
        >
          {'I already have a wallet'}
        </Button>
        <ImportWalletSheet
          visible={importSheetVisible}
          onClose={() => setImportSheetVisible(false)}
          onSelect={(route) => {
            setImportSheetVisible(false);
            navigation.navigate('ImportWallet', { initialScreen: route, label: undefined });
          }}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  primaryButton: {
    marginBottom: 16,
  },
  secondaryButton: {
    width: '100%',
    borderRadius: 24,
    borderWidth: 0,
    backgroundColor: '#EBF6FF',
    elevation: 0,
    shadowColor: 'transparent',
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    marginBottom: 24,
  },
  secondaryButtonContent: {
    height: 56,
  },
  secondaryButtonLabel: {
    color: Colors.primaryColor,
    fontWeight: '700',
    fontSize: 16,
    textTransform: 'none',
    letterSpacing: -0.2,
  },
});
