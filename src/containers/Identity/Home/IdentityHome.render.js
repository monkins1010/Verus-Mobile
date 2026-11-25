/*
  IdentityHome.render
  - 2026-11-18: Added "Register a VerusID" row below the identity list (opens the registration
    flow), and wired the empty-state "Create free VerusID" CTA to the same flow.
  - 2026-01-23: Replaced VerusIdDetailsModal with navigation to VerusIdDetails screen.
    Clicking a VerusID now navigates to a full-screen detail view instead of opening a bottom sheet.
  - 2026-01-23: Updated Link button styling to match "Lock profile" button (soft blue background #EBF6FF,
    blue text, increased size to 44px height with 22px border radius for better touch target and visual consistency).
    Vertically centered the Link button using transform translateY.
  - 2026-01-23: Removed "Ready to link" subtitle from ready-to-link items since the Link button makes it obvious.
  - 2026-01-22: Updated 'Identity' title styling to match 'Services' title (fontWeight: 'bold', removed letterSpacing).
  - 2026-01-14: Match Wallet header behavior by adding a conditional hairline divider that
    appears only when the identity list is scrolled (fixed header + subtle border on scroll).
  - 2026-01-14: Convert the identity list to a full-width SectionList, remove i-address from list rows,
    add a "Ready to link" section based on pending VerusID provisioning state, and switch to
    deterministic avatars for recognizability.
  - 2026-01-14: Move "Your VerusIDs" label into the fixed header area (Wallet-style) so it doesn't
    scroll under the main title, and render pending ("Ready to link") items above the list as a
    scrollable list header.
  - 2026-01-14: Hide the "Your VerusIDs" subheader when the screen is in the true empty state
    (no linked IDs and no pending IDs).
  - 2026-01-14: Add a Wallet-style bottom white fade overlay so long lists scroll smoothly behind
    the tab bar area (matches HomeFAB gradient fade behavior).
*/
import React from 'react';
import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity, Image, SectionList, Platform, StatusBar } from 'react-native';
import { Portal, Button } from 'react-native-paper';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Colors from '../../../globals/colors';
import IdentityInfoSheet from './components/IdentityInfoSheet';
import PendingIdentityStatusSheet from './components/PendingIdentityStatusSheet';
import IdentityListItem from './components/IdentityListItem';
import GradientButton from '../../../components/GradientButton';
import { NOTIFICATION_TYPE_VERUSID_READY, NOTIFICATION_TYPE_VERUSID_ERROR } from '../../../utils/constants/services';
import BottomFadeOverlay from '../../../components/BottomFadeOverlay';

const emptyVerusIdImg = require('../../../images/customIcons/empty-verusid.png');

// Match Wallet header icon affordances (see `Home.render.js`): icon-only, subtle padding, same hitSlop.
const iconHitSlop = { top: 10, bottom: 10, left: 10, right: 10 };
const headerDividerThreshold = 1;

const IdentityHomeRender = ({
  width,
  loading,
  hasLinkedIds,
  linkedIdCount,
  linkedItems,
  pendingGroups,
  hasPending,
  infoSheetVisible,
  setInfoSheetVisible,
  pendingStatusSheetVisible,
  selectedPendingItem,
  pendingAction,
  openPendingStatusSheet,
  closePendingStatusSheet,
  refreshPendingIdentity,
  removePendingIdentity,
  retryPendingIdentity,
  openLink,
  handleReadyIdentityAction,
  navigateToVerusIdDetails,
  openRegistrations,
  identityNetwork,
  onLayout
}) => {
  const insets = useSafeAreaInsets();
  const bottomPadding = Math.max(insets.bottom, 20);
  const bottomFadeHeight = 48;

  const [showHeaderDivider, setShowHeaderDivider] = React.useState(false);
  const showHeaderDividerRef = React.useRef(false);

  const handleListScroll = React.useCallback((event) => {
    const y = event?.nativeEvent?.contentOffset?.y ?? 0;
    const next = y > headerDividerThreshold;

    if (next !== showHeaderDividerRef.current) {
      showHeaderDividerRef.current = next;
      setShowHeaderDivider(next);
    }
  }, []);

  const renderModals = () => (
    <Portal>
      <IdentityInfoSheet 
        visible={infoSheetVisible} 
        onClose={() => setInfoSheetVisible(false)}
      />
      <PendingIdentityStatusSheet
        visible={pendingStatusSheetVisible}
        item={selectedPendingItem}
        activeAction={pendingAction}
        onClose={closePendingStatusSheet}
        onRefresh={refreshPendingIdentity}
        onRemove={removePendingIdentity}
        onRetry={retryPendingIdentity}
      />
    </Portal>
  );

  return (
    <SafeAreaView style={[styles.container, { paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0 }]}> 
      <Portal.Host>
        {renderModals()}
        
        <View style={[styles.header, showHeaderDivider && styles.headerScrolled]}>
          <View style={styles.headerTopRow}>
            <Text style={styles.headerTitle}>Identity</Text>
            <View style={styles.headerActions}>
              <TouchableOpacity
                onPress={() => setInfoSheetVisible(true)}
                hitSlop={iconHitSlop}
                style={styles.headerIconButton}
              >
                <MaterialCommunityIcons
                  name="information-variant"
                  size={20}
                  color={Colors.verusDarkGray}
                />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={openLink}
                hitSlop={iconHitSlop}
                style={styles.headerIconButton}
              >
                <MaterialCommunityIcons
                  name="plus"
                  size={20}
                  color={Colors.verusDarkGray}
                />
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {loading ? (
          <View style={styles.loadingWrap}>
            <Text style={styles.loadingText}>Loading...</Text>
          </View>
        ) : !hasLinkedIds && !hasPending ? (
          <View style={styles.emptyState}>
            <Image
              source={emptyVerusIdImg}
              style={styles.emptyImage}
              resizeMode="contain"
              accessibilityIgnoresInvertColors
            />
            <Text style={styles.emptyTitle}>No identity in your wallet</Text>
            <Text style={styles.emptyDescription}>
              Link a VerusID to manage funds, authenticate across apps, and keep your data in your hands.
            </Text>
            <GradientButton
              onPress={openRegistrations}
              style={styles.emptyPrimaryCta}
              // Match Wallet 'Buy & sell' button: rely on container height + default content centering.
              // Slight baseline nudge for iOS so the label looks optically centered at 44px height.
              labelStyle={{ marginTop: -1 }}
            >
              Create free VerusID
            </GradientButton>
            <Button
              mode="contained"
              onPress={openLink}
              style={styles.emptySecondaryCta}
              contentStyle={{ height: 44 }}
              uppercase={false}
              buttonColor="#EBF6FF"
              textColor={Colors.primaryColor}
              labelStyle={styles.emptySecondaryLabel}
            >
              Link VerusID
            </Button>
            <TouchableOpacity
              onPress={() => setInfoSheetVisible(true)}
              activeOpacity={0.75}
              style={styles.learnMoreRow}
            >
              <MaterialCommunityIcons
                name="information-variant"
                size={16}
                color={styles.learnMoreText.color}
                style={{ marginRight: 6 }}
              />
              <Text style={styles.learnMoreText}>VerusID explained</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <SectionList
            sections={[{ key: 'linked', data: linkedItems || [] }]}
            keyExtractor={(item) => `${item.chainId}:${item.iAddr}`}
            contentContainerStyle={[
              styles.listContent,
              { paddingBottom: 40 + bottomFadeHeight + bottomPadding },
            ]}
            showsVerticalScrollIndicator={false}
            onScroll={handleListScroll}
            scrollEventThrottle={16}
            onLayout={onLayout}
            stickySectionHeadersEnabled={false}
            renderSectionHeader={({ section: { key } }) => {
              if (key === 'linked' && (hasLinkedIds || hasPending)) {
                return (
                  <View style={styles.sectionHeader}>
                    <Text style={styles.subHeaderTitle}>Your VerusIDs</Text>
                    <Text style={styles.sectionCount}>{linkedIdCount ?? 0}</Text>
                  </View>
                );
              }
              return null;
            }}
            ListHeaderComponent={() => {
              const ready = pendingGroups?.ready || [];
              const attention = pendingGroups?.attention || [];
              const progress = pendingGroups?.progress || [];

              const hasAny = ready.length + attention.length + progress.length > 0;
              if (!hasAny) return <View style={{ height: 8 }} />;

              const renderPendingGroup = (title, items, showHeader = true) => {
                if (!items.length) return null;
                return (
                  <View style={{ marginBottom: 18 }}>
                    {showHeader && (
                      <View style={styles.pendingHeader}>
                        <Text style={styles.pendingTitle}>{title}</Text>
                        <Text style={styles.pendingCount}>{items.length}</Text>
                      </View>
                    )}
                    <View style={{ gap: 12 }}>
                      {items.map((item) => {
                        const isReady = item.status === NOTIFICATION_TYPE_VERUSID_READY;
                        const isError = item.status === NOTIFICATION_TYPE_VERUSID_ERROR;
                        const subtitle = isError
                          ? 'Needs attention'
                          : !isReady
                            ? 'In progress'
                            : undefined;
                        const pendingPress = isReady
                          ? () => handleReadyIdentityAction(item)
                          : () => openPendingStatusSheet(item);
                        const ctaLabel = item.readyActionConfig?.ctaLabel || 'Link';
                        const usesLoginFlow = item.readyActionConfig?.hasResponseUris;

                        return (
                          <View key={`${item.chainId}:${item.iAddr}`} style={styles.pendingRow}>
                            <IdentityListItem
                              name={item.display}
                              subtitle={subtitle}
                              network={isReady ? null : item.chainId}
                              isPreferred={item.chainId === identityNetwork}
                              onPress={pendingPress}
                              contentRightInset={isReady ? (usesLoginFlow ? 140 : 90) : 0}
                            />
                            {isReady && (
                              <View style={styles.pendingCtaWrap}>
                                <Button
                                  mode="contained"
                                  onPress={pendingPress}
                                  contentStyle={{ height: 36 }}
                                  uppercase={false}
                                  buttonColor="#EBF6FF"
                                  textColor={Colors.primaryColor}
                                  style={[styles.pendingCta, usesLoginFlow && styles.pendingCtaWide]}
                                  labelStyle={styles.pendingCtaLabel}
                                >
                                  {ctaLabel}
                                </Button>
                              </View>
                            )}
                          </View>
                        );
                      })}
                    </View>
                  </View>
                );
              };

              return (
                <View style={{ paddingTop: 8 }}>
                  {renderPendingGroup('Ready to link', ready, false)}
                  {renderPendingGroup('Needs attention', attention)}
                  {renderPendingGroup('In progress', progress)}
                </View>
              );
            }}
            ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
            ListFooterComponent={() => (
              <View style={styles.footerSection}>
                <Text style={[styles.subHeaderTitle, styles.footerTitle]}>Get a new VerusID</Text>
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={openRegistrations}
                  style={styles.actionRow}
                  accessibilityRole="button"
                  accessibilityLabel="Register a VerusID"
                >
                  <View style={styles.actionIconWrap}>
                    <MaterialCommunityIcons name="account-plus-outline" size={22} color={Colors.primaryColor} />
                  </View>
                  <View style={styles.actionTextWrap}>
                    <Text style={styles.actionTitle}>Register a VerusID</Text>
                    <Text style={styles.actionSubtitle} numberOfLines={2}>
                      Create a new identity or continue a registration
                    </Text>
                  </View>
                  <MaterialCommunityIcons name="chevron-right" size={24} color="#A0A6B1" />
                </TouchableOpacity>
              </View>
            )}
            renderItem={({ item }) => (
              <IdentityListItem
                name={item.display}
                network={item.chainId}
                isPreferred={item.chainId === identityNetwork}
                onPress={() => navigateToVerusIdDetails(item.chainId, item.iAddr, item.display)}
              />
            )}
          />
        )}

        {/* Wallet-style scroll-under fade (behind the tab bar area) */}
        {(hasLinkedIds || hasPending) && (
          <BottomFadeOverlay
            gradientHeight={bottomFadeHeight}
            solidHeight={bottomPadding}
            backgroundColor="#FFFFFF"
          />
        )}
      </Portal.Host>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
    backgroundColor: '#FFFFFF',
  },
  headerTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 10,
  },
  headerSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerScrolled: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E1E4EA',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: 'black',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerIconButton: {
    // Match `Home.render.js` -> `manageAssetsIconButton`
    padding: 6,
  },
  scroll: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 40,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    marginTop: 8,
  },
  subHeaderTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: 'black',
    letterSpacing: -0.2,
  },
  sectionCount: {
    marginLeft: 8,
    backgroundColor: '#F0F0F0',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    fontSize: 12,
    fontWeight: '700',
    color: '#666',
    overflow: 'hidden',
  },
  pendingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    marginTop: 6,
  },
  pendingTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111',
    letterSpacing: -0.1,
  },
  pendingCount: {
    marginLeft: 8,
    backgroundColor: '#F0F0F0',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    fontSize: 12,
    fontWeight: '700',
    color: '#666',
    overflow: 'hidden',
  },
  loadingText: {
    color: '#888',
    fontSize: 14,
    textAlign: 'center',
  },
  loadingWrap: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  
  // Empty State
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 24,
    paddingBottom: 60,
    paddingHorizontal: 32,
  },
  emptyImage: {
    width: 170,
    height: 140,
    marginBottom: 32,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.quinaryColor,
    marginBottom: 8,
    textAlign: 'center',
  },
  emptyDescription: {
    fontSize: 15,
    color: Colors.verusDarkGray,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 32,
  },
  // Match Wallet 'Buy & sell' button style (HomeFAB): 160x44, radius 22
  emptyPrimaryCta: {
    width: 200,
    height: 44,
    borderRadius: 22,
    marginBottom: 16,
  },
  // Match Wallet secondary button styling (outlined pill)
  emptySecondaryCta: {
    width: 200,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#EBF6FF',
    marginBottom: 16,
    borderWidth: 0,
    elevation: 0,
    shadowColor: 'transparent',
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
  },
  emptySecondaryLabel: {
    color: Colors.primaryColor,
    fontWeight: '700',
    fontSize: 16,
    letterSpacing: 0,
    textTransform: 'none',
  },
  learnMoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  learnMoreText: {
    color: '#7A7A7A',
    fontWeight: '600',
    fontSize: 13,
    letterSpacing: -0.1,
  },

  footerSection: {
    marginTop: 28,
  },
  footerTitle: {
    marginBottom: 12,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 14,
    minHeight: 76,
    borderWidth: 1,
    borderColor: '#EDEFF3',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 2,
  },
  actionIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#EBF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  actionTextWrap: {
    flex: 1,
    justifyContent: 'center',
  },
  actionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.quinaryColor,
    letterSpacing: -0.2,
    marginBottom: 2,
  },
  actionSubtitle: {
    fontSize: 13,
    color: Colors.verusDarkGray,
  },

  pendingRow: {
    width: '100%',
    justifyContent: 'center', // Helps vertical alignment
  },
  pendingCtaWrap: {
    position: 'absolute',
    right: 12,
    top: 0,
    bottom: 0,
    justifyContent: 'center', // Safest way to vertically center in the absolute container
  },
  pendingCta: {
    borderRadius: 18,
    height: 36,
    paddingHorizontal: 4,
    minWidth: 74,
    borderWidth: 0,
    backgroundColor: '#EBF6FF',
    elevation: 0,
    shadowColor: 'transparent',
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
  },
  pendingCtaWide: {
    minWidth: 132,
  },
  pendingCtaLabel: {
    color: Colors.primaryColor,
    fontWeight: '700',
    fontSize: 13,
    letterSpacing: -0.2,
    textTransform: 'none',
  },
});

export default IdentityHomeRender;
