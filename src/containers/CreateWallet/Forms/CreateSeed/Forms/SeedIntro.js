/*
  Updated SeedIntro screen:
  - Top-aligned layout with left-aligned title (black) matching ChooseName.js
  - Removed large icon/image for cleaner appearance
  - Modern warning card with better styling
  - Improved checkbox and button styling
  - Primary button matches design system (#CFEAF2 when disabled)
  - 2026-01-26: Updated primary button to use GradientButton for consistency.
*/
import React, {useState} from 'react';
import {View, Dimensions} from 'react-native';
import {Text, Paragraph, Checkbox, List} from 'react-native-paper';
import Button from '../../../../../components/Button';
import {MnemonicSeed} from '../../../../../images/customIcons';
import Colors from '../../../../../globals/colors';
import GradientButton from '../../../../../components/GradientButton';
import {SMALL_DEVICE_HEGHT} from '../../../../../utils/constants/constants';

export default function SeedIntro({navigation}) {
  const {height} = Dimensions.get('window');

  const [userAgrees, setUserAgrees] = useState(false);

  return (
    <SafeAreaView style={{flex: 1, backgroundColor: Colors.secondaryColor}}>
      <View
        style={{
          flex: 1,
          backgroundColor: Colors.secondaryColor,
          paddingHorizontal: 24,
          paddingTop: height < SMALL_DEVICE_HEGHT ? 40 : 60,
        }}>
        {/* Title - top-aligned, left-aligned, black */}
        <Text
          style={{
            textAlign: 'left',
            color: '#1A1A1A',
            fontSize: 32,
            fontWeight: '700',
            letterSpacing: -0.5,
            marginBottom: 12,
          }}>
          {'Your 24-word seed'}
        </Text>

        {/* Subtitle - left-aligned, improved typography */}
        <Text
          style={{
            textAlign: 'left',
            fontSize: 16,
            lineHeight: 22,
            color: '#555',
            marginBottom: 24,
          }}>
          {'This is the secret key that gives you access to your wallet.'}
        </Text>

        {/* Description */}
        <Text
          style={{
            textAlign: 'left',
            fontSize: 15,
            lineHeight: 21,
            color: '#666',
            marginBottom: 24,
          }}>
          {
            "Write each word down, separated by a space, and keep your words safe. You'll need them to recover your wallet."
          }
        </Text>

        {/* Warning card */}
        <Card
          mode="outlined"
          style={{
            borderRadius: 12,
            backgroundColor: '#FFF5F5',
            borderWidth: 1.5,
            borderColor: '#FFC9C9',
            marginBottom: 24,
          }}>
          <Card.Content style={{paddingVertical: 16, paddingHorizontal: 16}}>
            <View style={{flexDirection: 'row', alignItems: 'flex-start'}}>
              <Text
                style={{
                  fontSize: 20,
                  marginRight: 12,
                  marginTop: 2,
                }}>
                {'⚠️'}
              </Text>
              <View style={{flex: 1}}>
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: '600',
                    color: '#C92A2A',
                    lineHeight: 20,
                    marginBottom: 6,
                  }}>
                  {'Write down these words or risk losing access to your wallet!'}
                </Text>
                <Text
                  style={{
                    fontSize: 13,
                    color: '#C92A2A',
                    lineHeight: 18,
                  }}>
                  {'Never show the words to anyone. Store them securely offline.'}
                </Text>
              </View>
            </View>
          </Card.Content>
        </Card>

        {/* Spacer */}
        <View style={{flex: 1}} />

        {/* Checkbox */}
        <Checkbox.Item
          color={Colors.primaryColor}
          labelStyle={{
            fontSize: 14,
            lineHeight: 20,
            color: '#333',
            textAlign: 'left',
          }}
          label={
            'I understand the need to write down the seed and to keep it secure.'
          }
          status={userAgrees ? 'checked' : 'unchecked'}
          onPress={() => setUserAgrees(!userAgrees)}
          mode="android"
          style={{paddingLeft: 0, marginBottom: 16}}
        />

        {/* Continue button */}
        <GradientButton
          onPress={() => navigation.navigate('SeedWords')}
          disabled={!userAgrees}
          style={styles.continueButton}
        >
          {'Show words 1–8'}
        </GradientButton>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  continueButton: {
    marginBottom: 24,
  },
});
