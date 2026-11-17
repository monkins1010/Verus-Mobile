/*
  VerusIdWidget
  2025-11-04: Flattened into a full-width gradient block without card chrome.
*/
import React from 'react';
import { View, Dimensions, Text, StyleSheet } from 'react-native';
import Svg, {
  Defs,
  LinearGradient as SvgLinearGradient,
  RadialGradient as SvgRadialGradient,
  Stop,
  Rect,
} from 'react-native-svg';

const VerusIdWidget = () => {
  const { width } = Dimensions.get('window');
  const containerWidth = width - 32; // accounts for outer horizontal padding on the home scroll view
  const containerHeight = 108;

  return (
    <Card
      style={{
        height: 110,
        width: width / 2 - 16,
        borderRadius: 10,
        backgroundColor: Colors.ultraUltraLightGrey
      }}
      mode="elevated"
      elevation={5}>
      <Card.Content>
        <View
          style={{
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
          }}>
          <Paragraph style={{fontSize: 16, fontWeight: 'bold'}}>
            {'Create & manage'}
          </Paragraph>
        </View>
        <VerusIdLogo
          width={110}
          height={60}
          style={{
            marginLeft: 3,
          }}
        />
      </Card.Content>
    </Card>
  );
};

export default VerusIdWidget;
