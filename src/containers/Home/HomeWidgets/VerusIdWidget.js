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
    <View style={[styles.container, {minHeight: containerHeight}]}>
      <View style={styles.background} pointerEvents="none">
        <Svg width={containerWidth} height={containerHeight}>
          <Defs>
            <SvgLinearGradient id="verusIdGradient" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor="#FFFFFF" />
              <Stop offset="0.6" stopColor="#F8F8F8" />
              <Stop offset="1" stopColor="#F2F2F2" />
            </SvgLinearGradient>
            <SvgRadialGradient id="verusIdHighlight" cx="0.92" cy="0.88" r="0.85">
              <Stop offset="0" stopColor="#3165D4" stopOpacity="0.18" />
              <Stop offset="0.6" stopColor="#3165D4" stopOpacity="0.08" />
              <Stop offset="1" stopColor="#3165D4" stopOpacity="0" />
            </SvgRadialGradient>
          </Defs>
          <Rect x={0} y={0} width={containerWidth} height={containerHeight} fill="url(#verusIdGradient)" rx={16} ry={16} />
          <Rect x={0} y={0} width={containerWidth} height={containerHeight} fill="url(#verusIdHighlight)" rx={16} ry={16} />
        </Svg>
      </View>
      <Text style={styles.title}>Manage my VerusID</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    borderRadius: 16,
    overflow: 'hidden',
    paddingVertical: 24,
    paddingHorizontal: 20,
    justifyContent: 'flex-end',
    backgroundColor: '#F8F8F8',
    borderWidth: 1,
    borderColor: '#F0F0F0',
  },
  background: {...StyleSheet.absoluteFillObject},
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#3165D4',
    letterSpacing: -0.2,
  },
});

export default VerusIdWidget;
